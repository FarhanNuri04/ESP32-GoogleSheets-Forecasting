
/****************************************************
 * IOT SENSOR DATA FORECASTING SYSTEM
 * ESP32 + GOOGLE SHEETS + EMA
 *
 * SensorData:
 * A = Timestamp
 * B = Temperature
 * C = Humidity
 *
 * Forecasts:
 * A = Timestamp
 * B = Temperature Forecast
 * C = Temp Upper
 * D = Temp Lower
 * E = Humidity Forecast
 * F = Humidity Upper
 * G = Humidity Lower
 *
 * ForecastLog:
 * A = Forecast Generated
 * B = Forecast Timestamp
 * C = Temperature Forecast
 * D = Actual Temperature
 * E = Humidity Forecast
 * F = Actual Humidity
 * G = Temperature Error
 * H = Humidity Error
 *
 * ForecastAccuracy:
 * A = Parameter
 * B = MAE
 * C = RMSE
 * D = Matched Records
 * E = Last Updated
 ****************************************************/


/****************************************************
 * 1. SYSTEM SETTINGS
 ****************************************************/

var DATA_SHEET = "SensorData";
var FORECAST_SHEET = "Forecasts";
var LOG_SHEET = "ForecastLog";
var ACCURACY_SHEET = "ForecastAccuracy";

var INTERVAL_MINUTES = 10;
var FORECAST_HOURS = 24;
var FORECAST_INTERVAL_HOURS = 1;

var MAX_HISTORY_READINGS = 144;
var EMA_ALPHA = 0.3;

// Actual readings must be within 5 minutes
// of the forecast timestamp to be matched.
var MATCH_TOLERANCE_MINUTES = 5;


/****************************************************
 * 2. RECEIVE ESP32 SENSOR DATA
 ****************************************************/

function doGet(e) {
  return handleResponse(e);
}

function doPost(e) {
  return handleResponse(e);
}

function handleResponse(e) {

  var lock = LockService.getScriptLock();

  try {

    lock.waitLock(10000);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(DATA_SHEET);

    if (!sheet) {
      throw new Error("SensorData sheet not found");
    }

    var payload;

    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    } else {
      throw new Error("No sensor data received");
    }

    var temperature = Number(payload.temperature);
    var humidity = Number(payload.humidity);

    // Validate sensor readings

    if (
      payload.temperature === undefined ||
      payload.temperature === "" ||
      payload.humidity === undefined ||
      payload.humidity === "" ||
      !Number.isFinite(temperature) ||
      !Number.isFinite(humidity) ||
      temperature < -40 ||
      temperature > 80 ||
      humidity < 0 ||
      humidity > 100
    ) {
      throw new Error("Invalid temperature or humidity");
    }

    // Save actual sensor readings

    var timestamp = new Date();

    sheet.appendRow([
      timestamp,
      temperature,
      humidity
    ]);

    SpreadsheetApp.flush();

    // Match this actual reading with saved forecasts

    matchActualReading(
      timestamp,
      temperature,
      humidity
    );

    // Refresh accuracy summary

    updateForecastAccuracyMetrics();

    return ContentService
      .createTextOutput(JSON.stringify({
        status: "success",
        timestamp: timestamp.toISOString(),
        temperature: temperature,
        humidity: humidity
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {

    return ContentService
      .createTextOutput(JSON.stringify({
        status: "error",
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } finally {

    if (lock.hasLock()) {
      lock.releaseLock();
    }

  }
}


/****************************************************
 * 3. EXPONENTIAL MOVING AVERAGE
 ****************************************************/

function calculateEMA(values, alpha) {

  if (!values || values.length === 0) {
    throw new Error("No values available for EMA");
  }

  var ema = values[0];

  for (var i = 1; i < values.length; i++) {

    ema =
      alpha * values[i] +
      (1 - alpha) * ema;

  }

  return ema;
}


/****************************************************
 * 4. CALCULATE HISTORICAL EMA RESIDUAL RMSE
 ****************************************************/

function calculateEMARMSE(values, alpha) {

  if (!values || values.length < 2) {
    throw new Error("Not enough data to calculate EMA RMSE");
  }

  var ema = values[0];
  var squaredErrors = 0;
  var errorCount = 0;

  for (var i = 1; i < values.length; i++) {

    var predicted = ema;
    var error = values[i] - predicted;

    squaredErrors += error * error;
    errorCount++;

    ema =
      alpha * values[i] +
      (1 - alpha) * ema;

  }

  return Math.sqrt(squaredErrors / errorCount);
}


/****************************************************
 * 5. PREPARE FORECAST LOG SHEET
 ****************************************************/

function getForecastLogSheet() {

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheet = ss.getSheetByName(LOG_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET);
  }

  var headers = [[
    "Forecast Generated",
    "Forecast Timestamp",
    "Temperature Forecast",
    "Actual Temperature",
    "Humidity Forecast",
    "Actual Humidity",
    "Temperature Error",
    "Humidity Error"
  ]];

  sheet.getRange(1, 1, 1, 8).setValues(headers);

  return sheet;
}


/****************************************************
 * 6. SAVE FORECASTS INTO FORECAST LOG
 ****************************************************/

function saveForecastLog(forecastRows) {

  if (!forecastRows || forecastRows.length === 0) {
    return;
  }

  var sheet = getForecastLogSheet();

  var generatedAt = new Date();

  var logRows = forecastRows.map(function(row) {

    return [
      generatedAt,
      row[0],
      row[1],
      "",
      row[4],
      "",
      "",
      ""
    ];

  });

  var startRow = sheet.getLastRow() + 1;

  sheet
    .getRange(startRow, 1, logRows.length, 8)
    .setValues(logRows);

  sheet
    .getRange(startRow, 1, logRows.length, 2)
    .setNumberFormat("dd/MM/yyyy HH:mm:ss");

  sheet
    .getRange(startRow, 3, logRows.length, 6)
    .setNumberFormat("0.00");

}


/****************************************************
 * 7. MATCH ACTUAL SENSOR READINGS WITH FORECASTS
 ****************************************************/

function matchActualReading(
  actualTimestamp,
  actualTemperature,
  actualHumidity
) {

  var sheet = getForecastLogSheet();

  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return;
  }

  var data = sheet
    .getRange(2, 1, lastRow - 1, 8)
    .getValues();

  var tolerance =
    MATCH_TOLERANCE_MINUTES * 60 * 1000;

  var matched = false;

  for (var i = 0; i < data.length; i++) {

    var forecastTimestamp = data[i][1];

    if (!(forecastTimestamp instanceof Date)) {
      continue;
    }

    var timeDifference = Math.abs(
      actualTimestamp.getTime() -
      forecastTimestamp.getTime()
    );

    // Match only forecasts close to the actual timestamp.
    // Do not overwrite an already matched record.

    if (
      timeDifference <= tolerance &&
      (data[i][3] === "" || data[i][3] === null) &&
      (data[i][5] === "" || data[i][5] === null)
    ) {

      data[i][3] = actualTemperature;
      data[i][5] = actualHumidity;

      data[i][6] = Math.abs(
        actualTemperature - Number(data[i][2])
      );

      data[i][7] = Math.abs(
        actualHumidity - Number(data[i][4])
      );

      matched = true;
    }

  }

  if (matched) {

    sheet
      .getRange(2, 1, data.length, 8)
      .setValues(data);

    sheet
      .getRange(2, 1, data.length, 8)
      .setNumberFormat("0.00");

    // Restore timestamp formats

    sheet
      .getRange(2, 1, data.length, 2)
      .setNumberFormat("dd/MM/yyyy HH:mm:ss");

  }

}


/****************************************************
 * 8. CALCULATE FORECAST ACCURACY
 *
 * MAE  = Mean Absolute Error
 * RMSE = Root Mean Square Error
 ****************************************************/

function updateForecastAccuracyMetrics() {

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var logSheet = ss.getSheetByName(LOG_SHEET);

  if (!logSheet || logSheet.getLastRow() < 2) {
    return;
  }

  var data = logSheet
    .getRange(2, 1, logSheet.getLastRow() - 1, 8)
    .getValues();

  var tempErrors = [];
  var humidityErrors = [];

  for (var i = 0; i < data.length; i++) {

    var tempError = Number(data[i][6]);
    var humidityError = Number(data[i][7]);

    if (
      data[i][3] !== "" &&
      data[i][3] !== null &&
      Number.isFinite(tempError)
    ) {
      tempErrors.push(tempError);
    }

    if (
      data[i][5] !== "" &&
      data[i][5] !== null &&
      Number.isFinite(humidityError)
    ) {
      humidityErrors.push(humidityError);
    }

  }

  var accuracySheet =
    ss.getSheetByName(ACCURACY_SHEET);

  if (!accuracySheet) {
    accuracySheet = ss.insertSheet(ACCURACY_SHEET);
  }

  var headers = [[
    "Parameter",
    "MAE",
    "RMSE",
    "Matched Records",
    "Last Updated"
  ]];

  accuracySheet
    .getRange(1, 1, 1, 5)
    .setValues(headers);

  function calculateMetrics(errors) {

    if (errors.length === 0) {
      return ["", "", 0];
    }

    var sumAbsolute = 0;
    var sumSquared = 0;

    errors.forEach(function(error) {

      sumAbsolute += error;
      sumSquared += error * error;

    });

    var mae = sumAbsolute / errors.length;

    var rmse = Math.sqrt(
      sumSquared / errors.length
    );

    return [mae, rmse, errors.length];
  }

  var tempMetrics = calculateMetrics(tempErrors);
  var humidityMetrics = calculateMetrics(humidityErrors);

  var updatedAt = new Date();

  var results = [
    [
      "Temperature",
      tempMetrics[0],
      tempMetrics[1],
      tempMetrics[2],
      updatedAt
    ],
    [
      "Humidity",
      humidityMetrics[0],
      humidityMetrics[1],
      humidityMetrics[2],
      updatedAt
    ]
  ];

  accuracySheet
    .getRange(2, 1, 2, 5)
    .setValues(results);

  accuracySheet
    .getRange(2, 2, 2, 2)
    .setNumberFormat("0.000");

  accuracySheet
    .getRange(2, 5, 2, 1)
    .setNumberFormat("dd/MM/yyyy HH:mm:ss");

  SpreadsheetApp.flush();

}


/****************************************************
 * 9. GENERATE 24-HOUR EMA FORECAST
 ****************************************************/

function generateForecasts() {

  var lock = LockService.getScriptLock();

  try {

    lock.waitLock(10000);

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var dataSheet = ss.getSheetByName(DATA_SHEET);

    if (!dataSheet) {
      throw new Error("SensorData sheet not found");
    }

    var forecastSheet =
      ss.getSheetByName(FORECAST_SHEET);

    if (!forecastSheet) {
      forecastSheet = ss.insertSheet(FORECAST_SHEET);
    }

    var headers = [[
      "Timestamp",
      "Temperature Forecast",
      "Temp Upper",
      "Temp Lower",
      "Humidity Forecast",
      "Humidity Upper",
      "Humidity Lower"
    ]];

    forecastSheet
      .getRange(1, 1, 1, 7)
      .setValues(headers);

    var lastRow = dataSheet.getLastRow();

    if (lastRow < 3) {
      throw new Error("At least 2 sensor readings are required");
    }

    var data = dataSheet
      .getRange(2, 1, lastRow - 1, 3)
      .getValues();

    var validData = [];

    for (var i = 0; i < data.length; i++) {

      var timestamp = data[i][0];
      var temperature = Number(data[i][1]);
      var humidity = Number(data[i][2]);

      if (
        timestamp instanceof Date &&
        !isNaN(timestamp.getTime()) &&
        data[i][1] !== "" &&
        data[i][2] !== "" &&
        Number.isFinite(temperature) &&
        Number.isFinite(humidity) &&
        temperature >= -40 &&
        temperature <= 80 &&
        humidity >= 0 &&
        humidity <= 100
      ) {

        validData.push({
          timestamp: timestamp,
          temperature: temperature,
          humidity: humidity
        });

      }

    }

    if (validData.length < 2) {
      throw new Error("Not enough valid sensor readings");
    }

    validData.sort(function(a, b) {

      return a.timestamp.getTime() -
             b.timestamp.getTime();

    });

    validData = validData.slice(-MAX_HISTORY_READINGS);

    var temperatures = validData.map(function(row) {
      return row.temperature;
    });

    var humidities = validData.map(function(row) {
      return row.humidity;
    });

    var tempEMA = calculateEMA(
      temperatures,
      EMA_ALPHA
    );

    var humidityEMA = calculateEMA(
      humidities,
      EMA_ALPHA
    );

    var tempRMSE = calculateEMARMSE(
      temperatures,
      EMA_ALPHA
    );

    var humidityRMSE = calculateEMARMSE(
      humidities,
      EMA_ALPHA
    );

    var latestTimestamp =
      validData[validData.length - 1].timestamp;

    var totalPoints =
      FORECAST_HOURS / FORECAST_INTERVAL_HOURS;

    var forecastRows = [];

    for (var i = 1; i <= totalPoints; i++) {

      var nextTimestamp = new Date(
        latestTimestamp.getTime() +
        i * FORECAST_INTERVAL_HOURS * 60 * 60 * 1000
      );

      var temperatureForecast = tempEMA;

      var humidityForecast = Math.max(
        0,
        Math.min(100, humidityEMA)
      );

      var tempMargin = 2 * tempRMSE;
      var humidityMargin = 2 * humidityRMSE;

      var tempUpper =
        temperatureForecast + tempMargin;

      var tempLower =
        temperatureForecast - tempMargin;

      var humidityUpper = Math.min(
        100,
        humidityForecast + humidityMargin
      );

      var humidityLower = Math.max(
        0,
        humidityForecast - humidityMargin
      );

      forecastRows.push([
        nextTimestamp,
        temperatureForecast,
        tempUpper,
        tempLower,
        humidityForecast,
        humidityUpper,
        humidityLower
      ]);

    }

    // Update current Forecasts worksheet

    var oldRows = forecastSheet.getLastRow();

    if (oldRows > 1) {

      forecastSheet
        .getRange(2, 1, oldRows - 1, 7)
        .clearContent();

    }

    forecastSheet
      .getRange(2, 1, forecastRows.length, 7)
      .setValues(forecastRows);

    forecastSheet
      .getRange(2, 1, forecastRows.length, 1)
      .setNumberFormat("dd/MM/yyyy HH:mm");

    forecastSheet
      .getRange(2, 2, forecastRows.length, 6)
      .setNumberFormat("0.00");

    // Save a permanent copy of all 24 predictions

    saveForecastLog(forecastRows);

    // Refresh accuracy metrics

    updateForecastAccuracyMetrics();

    SpreadsheetApp.flush();

    Logger.log("EMA FORECAST COMPLETED");
    Logger.log("EMA Alpha: " + EMA_ALPHA);
    Logger.log("Temperature EMA: " + tempEMA);
    Logger.log("Humidity EMA: " + humidityEMA);
    Logger.log("Temperature RMSE: " + tempRMSE);
    Logger.log("Humidity RMSE: " + humidityRMSE);
    Logger.log("Forecast Interval: 1 hour");
    Logger.log("Forecast Duration: 24 hours");
    Logger.log("Total Forecast Records: " + totalPoints);

  } finally {

    if (lock.hasLock()) {
      lock.releaseLock();
    }

  }

}


/****************************************************
 * 10. GOOGLE SHEETS MENU
 ****************************************************/

function onOpen() {

  SpreadsheetApp.getUi()

    .createMenu("Sensor Data")

    .addItem(
      "Generate 24-Hour EMA Forecast",
      "generateForecasts"
    )

    .addItem(
      "Update Forecast Accuracy",
      "updateForecastAccuracyMetrics"
    )

    .addItem(
      "Clear Sensor Data",
      "clearData"
    )

    .addToUi();

}


/****************************************************
 * 11. CLEAR SENSOR DATA
 *
 * ForecastLog is intentionally preserved.
 ****************************************************/

function clearData() {

  var sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(DATA_SHEET);

  if (!sheet) {
    throw new Error("SensorData sheet not found");
  }

  var lastRow = sheet.getLastRow();

  if (lastRow > 1) {

    sheet
      .getRange(2, 1, lastRow - 1, 3)
      .clearContent();

  }

  Logger.log("Sensor data cleared successfully");

}
