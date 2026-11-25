# Forecasting Algorithm Selection

## Overview
The system collects temperature and humidity data using a DHT11 sensor connected to an ESP32. To predict future environmental conditions, three forecasting algorithms were evaluated: Simple Moving Average (SMA), Exponential Moving Average (EMA), and Linear Regression.

## Comparison of Algorithms

### 1. Simple Moving Average (SMA)
- **Strengths:** Easy to understand and implement, reduces random fluctuations.
- **Limitations:** Gives equal importance to all past readings, responds slowly to recent changes.

### 2. Linear Regression
- **Strengths:** Can identify increasing or decreasing trends.
- **Limitations:** Assumes a linear relationship, which is less suitable for irregular temperature/humidity changes.

### 3. Exponential Moving Average (EMA)
- **Strengths:** Gives more importance to recent readings, responds faster to changes.
- **Limitations:** Requires tuning the smoothing factor (alpha), does not model seasonal patterns directly.

## Selected Algorithm: EMA
**EMA was selected** because preliminary testing on historical sensor data showed it achieved the lowest Mean Absolute Error (MAE) and Root Mean Square Error (RMSE) for both temperature and humidity.

- **Smoothing Factor:** α = 0.3 (gives more weight to recent data).
- **Forecast Bounds:** Upper and Lower bounds are calculated using historical EMA residual RMSE to provide a range for the forecast.
