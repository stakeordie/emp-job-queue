# Custom Fluentd output plugin for Dash0 with OpenTelemetry log format
# Optimized for EMP Job Queue observability requirements

require 'fluent/plugin/output'
require 'net/http'
require 'uri'
require 'json'
require 'time'

module Fluent
  module Plugin
    class Dash0Output < Output
      Fluent::Plugin.register_output('dash0', self)

      helpers :compat_parameters, :inject

      desc 'Dash0 endpoint URL'
      config_param :endpoint, :string, default: 'https://ingress.us-west-2.aws.dash0.com/logs/json'
      
      desc 'Dash0 API key for authentication'
      config_param :api_key, :string, secret: true
      
      desc 'Dash0 dataset name'
      config_param :dataset, :string, default: 'development'
      
      desc 'HTTP timeout for requests'
      config_param :timeout, :integer, default: 30
      
      desc 'HTTP open timeout'
      config_param :open_timeout, :integer, default: 10
      
      desc 'Maximum retries for failed requests'
      config_param :max_retries, :integer, default: 3
      
      desc 'Batch size for sending logs'
      config_param :batch_size, :integer, default: 100

      config_section :buffer do
        config_set_default :@type, 'file'
        config_set_default :chunk_keys, ['tag']
        config_set_default :flush_mode, :interval
        config_set_default :flush_interval, 5
        config_set_default :flush_thread_count, 2
        config_set_default :retry_max_times, 10
        config_set_default :retry_exponential_backoff_base, 2
        config_set_default :retry_max_interval, 60
      end

      def configure(conf)
        compat_parameters_convert(conf, :inject)
        super

        @uri = URI.parse(@endpoint)
        @http = Net::HTTP.new(@uri.host, @uri.port)
        @http.use_ssl = @uri.scheme == 'https'
        @http.open_timeout = @open_timeout
        @http.read_timeout = @timeout
        
        log.info "Dash0 output plugin configured", 
                 endpoint: @endpoint, 
                 dataset: @dataset,
                 batch_size: @batch_size
      end

      def start
        super
        log.info "Dash0 output plugin started"
      end

      def shutdown
        super
        @http.finish if @http.started?
        log.info "Dash0 output plugin stopped"
      end

      def format(tag, time, record)
        # Convert to OpenTelemetry log format
        otel_log = {
          timeUnixNano: (time.to_f * 1_000_000_000).to_i.to_s,
          severityNumber: severity_number(record),
          severityText: severity_text(record),
          body: {
            stringValue: format_body(record)
          },
          attributes: format_attributes(tag, record),
          resource: format_resource(record),
          traceId: record['trace_id'] || '',
          spanId: record['span_id'] || ''
        }

        [otel_log].to_json + "\n"
      end

      def formatted_to_msgpack_binary?
        false
      end

      def write(chunk)
        logs = []
        
        chunk.each do |data|
          begin
            log_entry = JSON.parse(data)
            logs << log_entry
            
            if logs.size >= @batch_size
              send_batch(logs)
              logs.clear
            end
          rescue JSON::ParserError => e
            log.warn "Failed to parse log entry", error: e.message, data: data
          end
        end

        # Send remaining logs
        send_batch(logs) unless logs.empty?
      end

      private

      def send_batch(logs)
        return if logs.empty?

        payload = {
          resourceLogs: [
            {
              resource: {
                attributes: [
                  { key: 'service.name', value: { stringValue: 'emp-job-queue' } },
                  { key: 'service.version', value: { stringValue: ENV['SERVICE_VERSION'] || '1.0.0' } },
                  { key: 'deployment.environment', value: { stringValue: @dataset } }
                ]
              },
              scopeLogs: [
                {
                  scope: {
                    name: 'fluentd-aggregator',
                    version: '1.0.0'
                  },
                  logRecords: logs
                }
              ]
            }
          ]
        }

        retries = 0
        begin
          response = send_request(payload.to_json)
          
          if response.code.to_i >= 200 && response.code.to_i < 300
            log.debug "Successfully sent batch of #{logs.size} logs to Dash0"
          else
            raise "HTTP #{response.code}: #{response.body}"
          end
          
        rescue => e
          retries += 1
          if retries <= @max_retries
            wait_time = 2 ** (retries - 1)
            log.warn "Failed to send logs to Dash0, retrying in #{wait_time}s", 
                     error: e.message, 
                     retry: retries,
                     batch_size: logs.size
            sleep(wait_time)
            retry
          else
            log.error "Failed to send logs to Dash0 after #{@max_retries} retries", 
                      error: e.message,
                      batch_size: logs.size
            raise
          end
        end
      end

      def send_request(body)
        request = Net::HTTP::Post.new(@uri.path)
        request['Content-Type'] = 'application/json'
        request['Authorization'] = "Bearer #{@api_key}"
        request['Dash0-Dataset'] = @dataset
        request['User-Agent'] = 'fluentd-dash0-plugin/1.0.0'
        request.body = body

        @http.request(request)
      end

      def severity_number(record)
        case (record['level'] || record['severity'] || 'info').downcase
        when 'trace', 'debug' then 5
        when 'info' then 9
        when 'warn', 'warning' then 13
        when 'error' then 17
        when 'fatal', 'critical' then 21
        else 9 # default to info
        end
      end

      def severity_text(record)
        (record['level'] || record['severity'] || 'INFO').upcase
      end

      def format_body(record)
        message = record['message'] || record['msg'] || ''
        
        # If there's structured data, include it
        if record.key?('error') || record.key?('stack_trace')
          {
            message: message,
            error: record['error'],
            stack_trace: record['stack_trace']
          }.compact.to_json
        else
          message
        end
      end

      def format_attributes(tag, record)
        attributes = []
        
        # Standard attributes
        attributes << { key: 'tag', value: { stringValue: tag } }
        attributes << { key: 'source', value: { stringValue: record['source'] || 'unknown' } }
        
        # Correlation IDs
        %w[trace_id job_id machine_id worker_id request_id].each do |key|
          if record[key] && !record[key].empty?
            attributes << { key: key, value: { stringValue: record[key] } }
          end
        end
        
        # Context information
        %w[environment region service_name component].each do |key|
          if record[key]
            attributes << { key: key, value: { stringValue: record[key].to_s } }
          end
        end
        
        # Custom attributes (preserve any additional fields)
        record.each do |key, value|
          next if %w[message msg level severity time timestamp trace_id job_id machine_id worker_id source environment region service_name component].include?(key)
          
          case value
          when String
            attributes << { key: key, value: { stringValue: value } }
          when Numeric
            if value.is_a?(Integer)
              attributes << { key: key, value: { intValue: value } }
            else
              attributes << { key: key, value: { doubleValue: value } }
            end
          when TrueClass, FalseClass
            attributes << { key: key, value: { boolValue: value } }
          else
            attributes << { key: key, value: { stringValue: value.to_s } }
          end
        end
        
        attributes
      end

      def format_resource(record)
        {
          attributes: [
            { key: 'service.name', value: { stringValue: record['service_name'] || 'emp-job-queue' } },
            { key: 'service.instance.id', value: { stringValue: record['machine_id'] || 'unknown' } },
            { key: 'deployment.environment', value: { stringValue: record['environment'] || @dataset } },
            { key: 'cloud.region', value: { stringValue: record['region'] || 'unknown' } },
            { key: 'host.name', value: { stringValue: record['hostname'] || 'unknown' } }
          ]
        }
      end
    end
  end
end