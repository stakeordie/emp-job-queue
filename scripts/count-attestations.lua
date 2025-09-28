-- Lua script to count and analyze all attestation records
local pattern = ARGV[1] or "*attestation*"
local cursor = "0"
local total_count = 0
local ttl_buckets = {
    ["expires_in_1_day"] = 0,
    ["expires_in_2_days"] = 0,
    ["expires_in_3_days"] = 0,
    ["expires_in_4_days"] = 0,
    ["expires_in_5_days"] = 0,
    ["expires_later"] = 0,
    ["no_ttl"] = 0
}
local min_ttl = -1
local max_ttl = 0
local sample_keys = {}

-- Scan all keys matching pattern
repeat
    local result = redis.call("SCAN", cursor, "MATCH", pattern, "COUNT", 1000)
    cursor = result[1]
    local keys = result[2]

    for _, key in ipairs(keys) do
        total_count = total_count + 1

        -- Get TTL for this key
        local ttl = redis.call("TTL", key)

        -- Track min/max TTL
        if ttl > 0 then
            if min_ttl == -1 or ttl < min_ttl then
                min_ttl = ttl
            end
            if ttl > max_ttl then
                max_ttl = ttl
            end

            -- Bucket by days
            local days = math.floor(ttl / 86400)
            if days == 0 then
                ttl_buckets["expires_in_1_day"] = ttl_buckets["expires_in_1_day"] + 1
            elseif days == 1 then
                ttl_buckets["expires_in_2_days"] = ttl_buckets["expires_in_2_days"] + 1
            elseif days == 2 then
                ttl_buckets["expires_in_3_days"] = ttl_buckets["expires_in_3_days"] + 1
            elseif days == 3 then
                ttl_buckets["expires_in_4_days"] = ttl_buckets["expires_in_4_days"] + 1
            elseif days == 4 then
                ttl_buckets["expires_in_5_days"] = ttl_buckets["expires_in_5_days"] + 1
            else
                ttl_buckets["expires_later"] = ttl_buckets["expires_later"] + 1
            end
        else
            ttl_buckets["no_ttl"] = ttl_buckets["no_ttl"] + 1
        end

        -- Keep sample keys
        if #sample_keys < 5 then
            table.insert(sample_keys, key)
        end
    end
until cursor == "0"

-- Format results
local result = {
    ["total_count"] = total_count,
    ["min_ttl_seconds"] = min_ttl,
    ["max_ttl_seconds"] = max_ttl,
    ["min_ttl_days"] = min_ttl > 0 and string.format("%.2f", min_ttl / 86400) or "none",
    ["max_ttl_days"] = max_ttl > 0 and string.format("%.2f", max_ttl / 86400) or "none",
    ["expires_in_1_day"] = ttl_buckets["expires_in_1_day"],
    ["expires_in_2_days"] = ttl_buckets["expires_in_2_days"],
    ["expires_in_3_days"] = ttl_buckets["expires_in_3_days"],
    ["expires_in_4_days"] = ttl_buckets["expires_in_4_days"],
    ["expires_in_5_days"] = ttl_buckets["expires_in_5_days"],
    ["expires_later"] = ttl_buckets["expires_later"],
    ["no_ttl"] = ttl_buckets["no_ttl"],
    ["sample_keys"] = table.concat(sample_keys, ", ")
}

return cjson.encode(result)