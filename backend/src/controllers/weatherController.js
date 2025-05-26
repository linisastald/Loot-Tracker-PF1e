const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

// Weather condition types and their emojis
const WEATHER_CONDITIONS = {
    'Clear': '☀️',
    'Partly Cloudy': '⛅',
    'Cloudy': '☁️',
    'Overcast': '☁️',
    'Light Rain': '🌦️',
    'Rain': '🌧️',
    'Heavy Rain': '🌧️',
    'Thunderstorm': '⛈️',
    'Light Snow': '🌨️',
    'Snow': '❄️',
    'Heavy Snow': '❄️',
    'Blizzard': '🌨️',
    'Sleet': '🌨️',
    'Fog': '🌫️',
    'Hurricane': '🌀',
    'Tropical Storm': '🌀'
};

/**
 * Generate weather for a specific date
 */
const generateWeatherForDate = async (date, region, recentWeather = []) => {
    try {
        // Get region weather patterns
        const regionQuery = 'SELECT * FROM weather_regions WHERE region_name = $1';
        const regionResult = await dbUtils.executeQuery(regionQuery, [region]);
        
        if (regionResult.rows.length === 0) {
            throw new Error(`Weather region '${region}' not found`);
        }
        
        const regionData = regionResult.rows[0];
        const { year, month, day } = date;
        
        // Calculate seasonal adjustment
        const seasonalAdjustment = regionData.seasonal_temp_adjustment[month] || 0;
        
        // Base temperatures with seasonal adjustment
        let baseLow = regionData.base_temp_low + seasonalAdjustment;
        let baseHigh = regionData.base_temp_high + seasonalAdjustment;
        
        // Add temperature persistence from recent weather
        if (recentWeather.length > 0) {
            const avgRecentLow = recentWeather.reduce((sum, w) => sum + w.temp_low, 0) / recentWeather.length;
            const avgRecentHigh = recentWeather.reduce((sum, w) => sum + w.temp_high, 0) / recentWeather.length;
            
            // Gradually transition temperature (40% persistence, 60% new)
            baseLow = Math.round(avgRecentLow * 0.4 + baseLow * 0.6);
            baseHigh = Math.round(avgRecentHigh * 0.4 + baseHigh * 0.6);
        }
        
        // Add random variance
        const variance = regionData.temp_variance;
        const tempLow = baseLow + Math.round((Math.random() - 0.5) * variance);
        const tempHigh = baseHigh + Math.round((Math.random() - 0.5) * variance);
        
        // Ensure high > low
        const finalLow = Math.min(tempLow, tempHigh - 1);
        const finalHigh = Math.max(tempHigh, tempLow + 1);
        
        // Determine weather condition
        let condition = 'Clear';
        let precipitationType = null;
        let windSpeed = 5;
        let humidity = 50;
        let visibility = 'Clear';
        let description = '';
        
        // Check for special weather events
        const isStormSeason = regionData.storm_season_months && regionData.storm_season_months.includes(month);
        const isHurricaneSeason = regionData.hurricane_season_months && regionData.hurricane_season_months.includes(month);
        
        // Hurricane check (only for applicable regions)
        if (isHurricaneSeason && regionData.hurricane_chance && Math.random() < regionData.hurricane_chance) {
            if (Math.random() < 0.3) {
                condition = 'Hurricane';
                windSpeed = 75 + Math.floor(Math.random() * 80);
                description = 'Dangerous hurricane with destructive winds';
            } else {
                condition = 'Tropical Storm';
                windSpeed = 40 + Math.floor(Math.random() * 35);
                description = 'Tropical storm with strong winds and heavy rain';
            }
            precipitationType = 'Heavy Rain';
            humidity = 85 + Math.floor(Math.random() * 15);
            visibility = 'Poor';
        }
        // Storm check
        else if (isStormSeason && Math.random() < regionData.storm_chance) {
            if (finalHigh < 32) {
                condition = 'Blizzard';
                precipitationType = 'Heavy Snow';
                windSpeed = 25 + Math.floor(Math.random() * 30);
                description = 'Severe blizzard with heavy snow and strong winds';
            } else {
                condition = 'Thunderstorm';
                precipitationType = 'Heavy Rain';
                windSpeed = 15 + Math.floor(Math.random() * 20);
                description = 'Thunderstorm with heavy rain and lightning';
            }
            humidity = 80 + Math.floor(Math.random() * 20);
            visibility = 'Poor';
        }
        // Regular precipitation check
        else if (Math.random() < regionData.precipitation_chance) {
            if (finalHigh < 32) {
                // Snow conditions
                const snowRand = Math.random();
                if (snowRand < 0.3) {
                    condition = 'Light Snow';
                    precipitationType = 'Light Snow';
                } else if (snowRand < 0.7) {
                    condition = 'Snow';
                    precipitationType = 'Snow';
                } else {
                    condition = 'Heavy Snow';
                    precipitationType = 'Heavy Snow';
                }
            } else {
                // Rain conditions
                const rainRand = Math.random();
                if (rainRand < 0.3) {
                    condition = 'Light Rain';
                    precipitationType = 'Light Rain';
                } else if (rainRand < 0.7) {
                    condition = 'Rain';
                    precipitationType = 'Rain';
                } else {
                    condition = 'Heavy Rain';
                    precipitationType = 'Heavy Rain';
                }
            }
            humidity = 60 + Math.floor(Math.random() * 30);
            if (condition.includes('Heavy')) {
                visibility = 'Poor';
            } else if (condition.includes('Light')) {
                visibility = 'Good';
            } else {
                visibility = 'Fair';
            }
        }
        // Cloudy conditions
        else {
            const cloudRand = Math.random();
            if (cloudRand < 0.4) {
                condition = 'Clear';
                humidity = 30 + Math.floor(Math.random() * 30);
            } else if (cloudRand < 0.6) {
                condition = 'Partly Cloudy';
                humidity = 40 + Math.floor(Math.random() * 30);
            } else if (cloudRand < 0.8) {
                condition = 'Cloudy';
                humidity = 50 + Math.floor(Math.random() * 30);
            } else {
                condition = 'Overcast';
                humidity = 60 + Math.floor(Math.random() * 30);
            }
        }
        
        // Special fog condition for certain situations
        if (Math.random() < 0.05 && !precipitationType) {
            condition = 'Fog';
            visibility = 'Poor';
            humidity = 85 + Math.floor(Math.random() * 15);
        }
        
        // Adjust wind speed for clear days
        if (condition === 'Clear' || condition === 'Partly Cloudy') {
            windSpeed = 3 + Math.floor(Math.random() * 12);
        } else if (!windSpeed || windSpeed === 5) {
            windSpeed = 8 + Math.floor(Math.random() * 15);
        }
        
        return {
            year,
            month,
            day,
            region,
            condition,
            temp_low: finalLow,
            temp_high: finalHigh,
            precipitation_type: precipitationType,
            wind_speed: windSpeed,
            humidity,
            visibility,
            description: description || `${condition} conditions with temperatures from ${finalLow}°F to ${finalHigh}°F`
        };
    } catch (error) {
        logger.error('Error generating weather:', error);
        throw error;
    }
};

/**
 * Get weather for a specific date
 */
const getWeatherForDate = async (req, res) => {
    const { year, month, day, region } = req.params;
    
    try {
        const result = await dbUtils.executeQuery(
            'SELECT * FROM golarion_weather WHERE year = $1 AND month = $2 AND day = $3 AND region = $4',
            [parseInt(year), parseInt(month), parseInt(day), region]
        );
        
        if (result.rows.length === 0) {
            controllerFactory.sendSuccessResponse(res, null, 'Weather not found for this date and region');
        } else {
            const weather = result.rows[0];
            weather.emoji = WEATHER_CONDITIONS[weather.condition] || '🌤️';
            controllerFactory.sendSuccessResponse(res, weather, 'Weather retrieved successfully');
        }
    } catch (error) {
        throw error;
    }
};

/**
 * Get weather for a date range
 */
const getWeatherForRange = async (req, res) => {
    const { startYear, startMonth, startDay, endYear, endMonth, endDay, region } = req.params;
    
    try {
        const result = await dbUtils.executeQuery(
            `SELECT * FROM golarion_weather 
             WHERE region = $1 
             AND (year > $2 OR (year = $2 AND month > $3) OR (year = $2 AND month = $3 AND day >= $4))
             AND (year < $5 OR (year = $5 AND month < $6) OR (year = $5 AND month = $6 AND day <= $7))
             ORDER BY year, month, day`,
            [region, parseInt(startYear), parseInt(startMonth), parseInt(startDay), 
             parseInt(endYear), parseInt(endMonth), parseInt(endDay)]
        );
        
        const weatherData = result.rows.map(weather => ({
            ...weather,
            emoji: WEATHER_CONDITIONS[weather.condition] || '🌤️'
        }));
        
        controllerFactory.sendSuccessResponse(res, weatherData, 'Weather range retrieved successfully');
    } catch (error) {
        throw error;
    }
};

/**
 * Initialize weather history for a region
 */
const initializeWeatherHistory = async (req, res) => {
    const { region } = req.params;
    
    try {
        // Get current date
        const currentDateResult = await dbUtils.executeQuery('SELECT * FROM golarion_current_date');
        if (currentDateResult.rows.length === 0) {
            throw new Error('No current date set');
        }
        
        const currentDate = currentDateResult.rows[0];
        
        // Generate weather for the past 10 days
        const weatherData = [];
        for (let i = 9; i >= 0; i--) {
            let targetDate = { ...currentDate };
            targetDate.day -= i;
            
            // Handle month/year rollover
            while (targetDate.day < 1) {
                targetDate.month--;
                if (targetDate.month < 1) {
                    targetDate.month = 12;
                    targetDate.year--;
                }
                const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                targetDate.day += monthDays[targetDate.month - 1]; // Convert 1-12 to 0-11 for array access
            }
            
            // Get recent weather for weather generation context
            const recentWeather = weatherData.slice(-3);
            
            const weather = await generateWeatherForDate(targetDate, region, recentWeather);
            weatherData.push(weather);
        }
        
        // Insert all weather data
        await dbUtils.executeTransaction(async (client) => {
            for (const weather of weatherData) {
                await client.query(
                    `INSERT INTO golarion_weather 
                     (year, month, day, region, condition, temp_low, temp_high, precipitation_type, 
                      wind_speed, humidity, visibility, description)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                     ON CONFLICT (year, month, day, region) DO NOTHING`,
                    [weather.year, weather.month, weather.day, weather.region, weather.condition,
                     weather.temp_low, weather.temp_high, weather.precipitation_type,
                     weather.wind_speed, weather.humidity, weather.visibility, weather.description]
                );
            }
        });
        
        controllerFactory.sendSuccessResponse(res, { initialized: weatherData.length }, 
            'Weather history initialized successfully');
    } catch (error) {
        throw error;
    }
};

/**
 * Set weather for a specific date (manual override)
 */
const setWeatherForDate = async (req, res) => {
    const { year, month, day, region, condition, tempLow, tempHigh, precipitationType, 
            windSpeed, humidity, visibility, description } = req.body;
    
    try {
        await dbUtils.executeQuery(
            `INSERT INTO golarion_weather 
             (year, month, day, region, condition, temp_low, temp_high, precipitation_type, 
              wind_speed, humidity, visibility, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (year, month, day, region) 
             DO UPDATE SET 
                condition = EXCLUDED.condition,
                temp_low = EXCLUDED.temp_low,
                temp_high = EXCLUDED.temp_high,
                precipitation_type = EXCLUDED.precipitation_type,
                wind_speed = EXCLUDED.wind_speed,
                humidity = EXCLUDED.humidity,
                visibility = EXCLUDED.visibility,
                description = EXCLUDED.description`,
            [year, month, day, region, condition, tempLow, tempHigh, precipitationType,
             windSpeed, humidity, visibility, description]
        );
        
        controllerFactory.sendSuccessResponse(res, { year, month, day, region }, 
            'Weather set successfully');
    } catch (error) {
        throw error;
    }
};

/**
 * Get available weather regions
 */
const getAvailableRegions = async (req, res) => {
    try {
        const result = await dbUtils.executeQuery('SELECT region_name FROM weather_regions ORDER BY region_name');
        const regions = result.rows.map(row => row.region_name);
        controllerFactory.sendSuccessResponse(res, regions, 'Available regions retrieved');
    } catch (error) {
        throw error;
    }
};

/**
 * Generate weather for the next day (to be called from calendar controller)
 */
const generateWeatherForNextDay = async (newDate, region) => {
    try {
        // Get recent weather for context
        const recentWeatherQuery = `
            SELECT * FROM golarion_weather 
            WHERE region = $1 
            ORDER BY year DESC, month DESC, day DESC 
            LIMIT 7
        `;
        const recentResult = await dbUtils.executeQuery(recentWeatherQuery, [region]);
        const recentWeather = recentResult.rows.reverse(); // Get in chronological order
        
        // Generate weather for the new date
        const weather = await generateWeatherForDate(newDate, region, recentWeather);
        
        // Save to database
        await dbUtils.executeQuery(
            `INSERT INTO golarion_weather 
             (year, month, day, region, condition, temp_low, temp_high, precipitation_type, 
              wind_speed, humidity, visibility, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (year, month, day, region) DO NOTHING`,
            [weather.year, weather.month, weather.day, weather.region, weather.condition,
             weather.temp_low, weather.temp_high, weather.precipitation_type,
             weather.wind_speed, weather.humidity, weather.visibility, weather.description]
        );
        
        return weather;
    } catch (error) {
        logger.error('Error generating weather for next day:', error);
        throw error;
    }
};

// Define validation rules
const setWeatherValidation = {
    requiredFields: ['year', 'month', 'day', 'region', 'condition', 'tempLow', 'tempHigh']
};

// Create handlers with validation and error handling
module.exports = {
    getWeatherForDate: controllerFactory.createHandler(getWeatherForDate, {
        errorMessage: 'Error getting weather for date'
    }),
    
    getWeatherForRange: controllerFactory.createHandler(getWeatherForRange, {
        errorMessage: 'Error getting weather for range'
    }),
    
    initializeWeatherHistory: controllerFactory.createHandler(initializeWeatherHistory, {
        errorMessage: 'Error initializing weather history'
    }),
    
    setWeatherForDate: controllerFactory.createHandler(setWeatherForDate, {
        errorMessage: 'Error setting weather for date',
        validation: setWeatherValidation
    }),
    
    getAvailableRegions: controllerFactory.createHandler(getAvailableRegions, {
        errorMessage: 'Error getting available regions'
    }),
    
    // Export for use in other controllers
    generateWeatherForNextDay
};
