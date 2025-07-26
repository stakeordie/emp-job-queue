#!/usr/bin/env node
/**
 * Weather API Connector - Demo API service for the unified machine
 * 
 * This demonstrates how to add a new API service to the unified machine architecture.
 * It provides a complete REST API with multiple endpoints, data storage, and error handling.
 * 
 * Features:
 * - Multiple REST endpoints
 * - In-memory data storage
 * - Error handling and validation
 * - Health checks
 * - Redis integration (for job processing)
 * - Express middleware
 * - API documentation endpoint
 */

import express from 'express';
import { createServer } from 'http';
import { createLogger } from '../../utils/logger.js';
import { BaseService } from '../base-service.js';

const logger = createLogger('weather-api');

export default class WeatherAPIConnector extends BaseService {
  constructor(options = {}) {
    super('weather-api-connector', options);
    
    this.port = options.port || 3001;
    this.host = options.host || '0.0.0.0';
    this.app = express();
    this.server = createServer(this.app);
    
    // Mock weather data storage
    this.weatherData = new Map();
    this.locations = new Map();
    this.forecasts = new Map();
    
    // Initialize with some sample data
    this.initializeSampleData();
    
    // Setup Express middleware and routes
    this.setupMiddleware();
    this.setupRoutes();
  }

  initializeSampleData() {
    // Sample weather data for different cities
    const sampleData = [
      {
        id: 'nyc',
        city: 'New York',
        country: 'USA',
        lat: 40.7128,
        lon: -74.0060,
        temperature: 22,
        humidity: 65,
        pressure: 1013,
        windSpeed: 12,
        windDirection: 'NW',
        condition: 'Partly Cloudy',
        visibility: 10,
        uvIndex: 6
      },
      {
        id: 'london',
        city: 'London',
        country: 'UK',
        lat: 51.5074,
        lon: -0.1278,
        temperature: 15,
        humidity: 78,
        pressure: 1008,
        windSpeed: 8,
        windDirection: 'SW',
        condition: 'Overcast',
        visibility: 8,
        uvIndex: 3
      },
      {
        id: 'tokyo',
        city: 'Tokyo',
        country: 'Japan',
        lat: 35.6762,
        lon: 139.6503,
        temperature: 28,
        humidity: 72,
        pressure: 1016,
        windSpeed: 6,
        windDirection: 'E',
        condition: 'Sunny',
        visibility: 12,
        uvIndex: 8
      }
    ];

    sampleData.forEach(data => {
      this.weatherData.set(data.id, {
        ...data,
        lastUpdated: new Date().toISOString(),
        source: 'simulation'
      });
      
      this.locations.set(data.id, {
        id: data.id,
        city: data.city,
        country: data.country,
        lat: data.lat,
        lon: data.lon
      });
    });

    // Generate 5-day forecasts
    sampleData.forEach(data => {
      const forecast = [];
      for (let i = 1; i <= 5; i++) {
        forecast.push({
          date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          high: data.temperature + Math.floor(Math.random() * 10) - 5,
          low: data.temperature - Math.floor(Math.random() * 8) - 3,
          condition: ['Sunny', 'Partly Cloudy', 'Cloudy', 'Rainy', 'Thunderstorm'][Math.floor(Math.random() * 5)],
          precipitation: Math.floor(Math.random() * 100),
          windSpeed: Math.floor(Math.random() * 20) + 5
        });
      }
      this.forecasts.set(data.id, forecast);
    });

    logger.info(`Initialized weather data for ${sampleData.length} cities`);
  }

  setupMiddleware() {
    // JSON parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`, { 
        query: req.query, 
        userAgent: req.get('User-Agent')
      });
      next();
    });

    // Add request timestamp
    this.app.use((req, res, next) => {
      req.timestamp = new Date().toISOString();
      next();
    });
  }

  setupRoutes() {
    // API Documentation endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Weather API Connector',
        version: '1.0.0',
        description: 'Demo API service for the unified machine architecture',
        endpoints: {
          'GET /': 'API documentation',
          'GET /health': 'Health check',
          'GET /status': 'Service status',
          'GET /weather': 'List all weather data',
          'GET /weather/:locationId': 'Get weather for specific location',
          'POST /weather/:locationId': 'Update weather for location',
          'GET /locations': 'List all available locations',
          'GET /forecast/:locationId': 'Get 5-day forecast',
          'GET /search?q=cityname': 'Search locations by city name',
          'POST /locations': 'Add new location',
          'DELETE /weather/:locationId': 'Remove weather data'
        },
        machineInfo: {
          type: process.env.MACHINE_TYPE || 'api',
          id: process.env.MACHINE_ID || 'unknown',
          port: this.port,
          timestamp: req.timestamp
        }
      });
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'weather-api-connector',
        timestamp: req.timestamp,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        version: '1.0.0'
      });
    });

    // Service status with metrics
    this.app.get('/status', (req, res) => {
      res.json({
        service: 'Weather API Connector',
        status: 'running',
        statistics: {
          totalLocations: this.locations.size,
          totalWeatherRecords: this.weatherData.size,
          totalForecasts: this.forecasts.size,
          lastUpdate: new Date().toISOString()
        },
        configuration: {
          port: this.port,
          host: this.host,
          machineType: process.env.MACHINE_TYPE || 'api',
          machineId: process.env.MACHINE_ID || 'unknown'
        }
      });
    });

    // Get all weather data
    this.app.get('/weather', (req, res) => {
      const allWeather = Array.from(this.weatherData.values());
      res.json({
        count: allWeather.length,
        data: allWeather,
        timestamp: req.timestamp
      });
    });

    // Get weather for specific location
    this.app.get('/weather/:locationId', (req, res) => {
      const { locationId } = req.params;
      const weather = this.weatherData.get(locationId);
      
      if (!weather) {
        return res.status(404).json({
          error: 'Location not found',
          locationId,
          timestamp: req.timestamp
        });
      }

      // Simulate real-time data by slightly randomizing values
      const liveWeather = {
        ...weather,
        temperature: weather.temperature + (Math.random() - 0.5) * 2,
        humidity: Math.max(0, Math.min(100, weather.humidity + (Math.random() - 0.5) * 10)),
        pressure: weather.pressure + (Math.random() - 0.5) * 5,
        windSpeed: Math.max(0, weather.windSpeed + (Math.random() - 0.5) * 5),
        lastUpdated: req.timestamp
      };

      res.json({
        data: liveWeather,
        timestamp: req.timestamp
      });
    });

    // Update weather for location
    this.app.post('/weather/:locationId', (req, res) => {
      const { locationId } = req.params;
      const updates = req.body;
      
      const currentWeather = this.weatherData.get(locationId);
      if (!currentWeather) {
        return res.status(404).json({
          error: 'Location not found',
          locationId,
          timestamp: req.timestamp
        });
      }

      // Validate and update weather data
      const updatedWeather = {
        ...currentWeather,
        ...updates,
        lastUpdated: req.timestamp,
        source: 'user_update'
      };

      this.weatherData.set(locationId, updatedWeather);
      
      logger.info(`Weather data updated for ${locationId}`, updates);
      
      res.json({
        message: 'Weather data updated successfully',
        data: updatedWeather,
        timestamp: req.timestamp
      });
    });

    // Get all locations
    this.app.get('/locations', (req, res) => {
      const allLocations = Array.from(this.locations.values());
      res.json({
        count: allLocations.length,
        data: allLocations,
        timestamp: req.timestamp
      });
    });

    // Get forecast for location
    this.app.get('/forecast/:locationId', (req, res) => {
      const { locationId } = req.params;
      const forecast = this.forecasts.get(locationId);
      const location = this.locations.get(locationId);
      
      if (!forecast || !location) {
        return res.status(404).json({
          error: 'Forecast not found for location',
          locationId,
          timestamp: req.timestamp
        });
      }

      res.json({
        location,
        forecast,
        timestamp: req.timestamp
      });
    });

    // Search locations by city name
    this.app.get('/search', (req, res) => {
      const { q } = req.query;
      
      if (!q) {
        return res.status(400).json({
          error: 'Query parameter "q" is required',
          timestamp: req.timestamp
        });
      }

      const searchTerm = q.toLowerCase();
      const results = Array.from(this.locations.values()).filter(location =>
        location.city.toLowerCase().includes(searchTerm) ||
        location.country.toLowerCase().includes(searchTerm)
      );

      res.json({
        query: q,
        count: results.length,
        results,
        timestamp: req.timestamp
      });
    });

    // Add new location
    this.app.post('/locations', (req, res) => {
      const { id, city, country, lat, lon } = req.body;
      
      if (!id || !city || !country || lat === undefined || lon === undefined) {
        return res.status(400).json({
          error: 'Missing required fields: id, city, country, lat, lon',
          timestamp: req.timestamp
        });
      }

      if (this.locations.has(id)) {
        return res.status(409).json({
          error: 'Location with this ID already exists',
          id,
          timestamp: req.timestamp
        });
      }

      const newLocation = { id, city, country, lat, lon };
      this.locations.set(id, newLocation);
      
      // Create default weather data
      const defaultWeather = {
        ...newLocation,
        temperature: 20,
        humidity: 50,
        pressure: 1013,
        windSpeed: 10,
        windDirection: 'N',
        condition: 'Clear',
        visibility: 10,
        uvIndex: 5,
        lastUpdated: req.timestamp,
        source: 'default'
      };
      
      this.weatherData.set(id, defaultWeather);
      
      logger.info(`New location added: ${city}, ${country} (${id})`);
      
      res.status(201).json({
        message: 'Location added successfully',
        data: {
          location: newLocation,
          weather: defaultWeather
        },
        timestamp: req.timestamp
      });
    });

    // Delete weather data for location
    this.app.delete('/weather/:locationId', (req, res) => {
      const { locationId } = req.params;
      
      const deleted = this.weatherData.delete(locationId);
      this.forecasts.delete(locationId);
      
      if (!deleted) {
        return res.status(404).json({
          error: 'Location not found',
          locationId,
          timestamp: req.timestamp
        });
      }

      logger.info(`Weather data deleted for location: ${locationId}`);
      
      res.json({
        message: 'Weather data deleted successfully',
        locationId,
        timestamp: req.timestamp
      });
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      logger.error('API Error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        timestamp: req.timestamp
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: req.timestamp,
        availableEndpoints: [
          'GET /',
          'GET /health',
          'GET /status',
          'GET /weather',
          'GET /weather/:locationId',
          'POST /weather/:locationId',
          'GET /locations',
          'GET /forecast/:locationId',
          'GET /search?q=cityname',
          'POST /locations',
          'DELETE /weather/:locationId'
        ]
      });
    });
  }

  async onStart() {
    logger.info(`Starting Weather API Connector on ${this.host}:${this.port}`);
    
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, this.host, (error) => {
        if (error) {
          logger.error('Failed to start Weather API Connector:', error);
          reject(error);
        } else {
          logger.info(`Weather API Connector running on http://${this.host}:${this.port}`);
          logger.info(`API Documentation available at http://${this.host}:${this.port}/`);
          resolve();
        }
      });
    });
  }

  async onStop() {
    logger.info('Stopping Weather API Connector...');
    
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('Weather API Connector stopped');
          resolve();
        });
      });
    }
  }

  async onHealthCheck() {
    return this.server && this.server.listening;
  }

  // Additional method to integrate with Redis job processing
  async processWeatherJob(jobData) {
    logger.info('Processing weather job:', jobData);
    
    try {
      const { action, locationId, data } = jobData;
      
      switch (action) {
        case 'get_weather':
          return this.weatherData.get(locationId) || null;
          
        case 'update_weather':
          if (this.weatherData.has(locationId)) {
            const updated = { ...this.weatherData.get(locationId), ...data, lastUpdated: new Date().toISOString() };
            this.weatherData.set(locationId, updated);
            return updated;
          }
          return null;
          
        case 'get_forecast':
          return this.forecasts.get(locationId) || null;
          
        default:
          throw new Error(`Unknown weather job action: ${action}`);
      }
    } catch (error) {
      logger.error('Weather job processing error:', error);
      throw error;
    }
  }
}