# IoT Sensor Data Forecasting System Using ESP32 and DHT11

## Overview
This project is an IoT-based environmental monitoring and forecasting system that uses an ESP32 microcontroller and a DHT11 sensor to collect temperature and humidity readings. The data is transmitted over Wi-Fi to Google Sheets through a Google Apps Script web app. A forecasting function in Google Apps Script processes the historical sensor data and generates 24-hour forecasts using the Exponential Moving Average (EMA) method. The results are stored in Google Sheets and visualized using a Looker Studio dashboard.

This project extends a basic IoT sensor monitoring system by adding a forecasting feature, allowing users to estimate future temperature and humidity conditions based on historical sensor readings.

## System Architecture
The system consists of four main stages:

1. **Data Collection** – ESP32 reads temperature and humidity from the DHT11 sensor.
2. **Data Transmission** – ESP32 sends sensor readings to Google Apps Script via Wi-Fi.
3. **Data Storage and Forecasting** – Google Sheets stores historical data, while Google Apps Script performs EMA forecasting.
4. **Visualization** – Looker Studio displays historical readings, forecast results, and monitoring indicators.

Data flow:

DHT11 → ESP32 → Wi-Fi → Google Apps Script Web App → Google Sheets → EMA Forecast Function → Google Sheets (Forecasts) → Looker Studio

## Hardware Components
- **ESP32** – Main microcontroller that reads sensor data and sends it over Wi-Fi.
- **DHT11** – Low-cost temperature and humidity sensor.
- **Wiring** – DHT11 data pin connected to GPIO 16, powered from ESP32 3.3V and GND.

## Software and Cloud Components
- **Arduino IDE** – Used to program the ESP32.
- **Google Apps Script** – Receives sensor data, validates readings, performs EMA forecasting, and stores forecast results.
- **Google Sheets** – Cloud database for historical sensor readings and forecast records.
- **Looker Studio** – Dashboard for visualizing historical and predicted temperature and humidity data.

## Forecasting Algorithm Selection
Three forecasting techniques were considered:

- Simple Moving Average (SMA)
- Exponential Moving Average (EMA)
- Linear Regression

Based on preliminary testing, **EMA was selected** because it achieved the lowest Mean Absolute Error (MAE) and Root Mean Square Error (RMSE) for both temperature and humidity.

Selected smoothing factor:

α = 0.3

Forecast output:

- 24 future forecast records
- 1-hour forecast interval
- Upper and lower forecast boundaries calculated using historical EMA residual RMSE

## Repository Contents
- `ESP32_Code/` – Well-commented ESP32 code for reading DHT11 data and sending it to Google Apps Script.
- `Apps_Script/` – Well-commented Google Apps Script code for receiving data, validating readings, performing EMA forecasting, and storing results.
- `Documentation/` – Documentation on forecasting algorithm selection, including comparison of SMA, EMA, and Linear Regression.
- `README.md` – Project overview, setup summary, and submission links.

## Google Sheet
The Google Sheet used for data storage and forecasting is shared with view access:

[Insert Google Sheet Link Here]

## Key Results
- ESP32 successfully collects temperature and humidity readings every 10 minutes.
- EMA produced the lowest MAE and RMSE compared with SMA and Linear Regression.
- The system generates 24-hour forecasts at one-hour intervals.
- Looker Studio displays historical sensor data and future predictions through scorecards and time-series charts.

## Future Improvements
- Collect more historical data for better forecasting accuracy.
- Test additional forecasting methods such as Holt-Winters.
- Improve forecast-to-actual matching for more reliable MAE and RMSE calculation.
- Enhance the Looker Studio dashboard with more indicators and mobile-friendly layout.

## Authors
- Muhammad Nur Farhan Bin Nuri
- Afiq Farhan Bin Abdul Khamis

Supervisor: Prof Madya Ir. Ts. Dr. Mohd Zamri Bin Ibrahim
