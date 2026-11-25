#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

// =====================================
// 1. WIFI SETTINGS
// =====================================

const char* ssid = "Your Wifi Name";
const char* password = "Your Wifi Password";

// =====================================
// 2. GOOGLE APPS SCRIPT URL
// =====================================

const char* scriptURL =
  "Add Your App script URL";

// =====================================
// 3. DHT11 SENSOR SETTINGS
// =====================================

#define DHTPIN 16
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

// =====================================
// 4. DATA TRANSMISSION SETTINGS
// =====================================

// 60000 = 1 minute for testing
// 600000 = 10 minutes for normal operation

const unsigned long sendInterval = 600000;

unsigned long previousMillis = 0;

// =====================================
// 5. WIFI CONNECTION
// =====================================

void connectWiFi() {

  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println();
  Serial.print("Connecting to WiFi");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;

  while (WiFi.status() != WL_CONNECTED && attempts < 30) {

    delay(500);
    Serial.print(".");

    attempts++;
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {

    Serial.println("WiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

  } else {

    Serial.println("WiFi connection failed.");

  }
}

// =====================================
// 6. SEND DATA TO GOOGLE SHEETS
// =====================================

void sendDataToGoogleSheets(float temperature, float humidity) {

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi disconnected. Reconnecting...");
    connectWiFi();

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Unable to send data.");
      return;
    }
  }

  String url = String(scriptURL) +
               "?temperature=" + String(temperature, 2) +
               "&humidity=" + String(humidity, 2);

  Serial.println();
  Serial.println("Sending sensor data...");
  Serial.print("Temperature: ");
  Serial.print(temperature);
  Serial.println(" C");

  Serial.print("Humidity: ");
  Serial.print(humidity);
  Serial.println(" %");

  HTTPClient http;

  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  http.setTimeout(20000);

  if (!http.begin(url)) {

    Serial.println("HTTP connection initialization failed.");
    return;

  }

  int httpResponseCode = http.GET();

  if (httpResponseCode > 0) {

    String response = http.getString();

    Serial.print("HTTP Response Code: ");
    Serial.println(httpResponseCode);

    Serial.print("Server Response: ");
    Serial.println(response);

    if (response.indexOf("\"status\":\"success\"") >= 0) {

      Serial.println("DATA UPLOADED SUCCESSFULLY!");

    } else {

      Serial.println("Server did not confirm successful upload.");

    }

  } else {

    Serial.print("HTTP Error: ");
    Serial.println(httpResponseCode);

  }

  http.end();

  Serial.println("--------------------------------");
}

// =====================================
// 7. READ DHT11 SENSOR
// =====================================

void readAndSendSensorData() {

  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  if (isnan(humidity) || isnan(temperature)) {

    Serial.println("ERROR: Failed to read DHT11 sensor!");
    return;

  }

  // Validate sensor readings

  if (
    temperature < -40 ||
    temperature > 80 ||
    humidity < 0 ||
    humidity > 100
  ) {

    Serial.println("ERROR: Invalid sensor reading!");
    return;

  }

  sendDataToGoogleSheets(temperature, humidity);
}

// =====================================
// 8. SETUP
// =====================================

void setup() {

  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println("================================");
  Serial.println("IOT SENSOR DATA FORECASTING");
  Serial.println("ESP32 + DHT11 + GOOGLE SHEETS");
  Serial.println("Forecasting Method: EMA");
  Serial.println("================================");

  dht.begin();

  connectWiFi();

  if (WiFi.status() == WL_CONNECTED) {

    // Send first reading immediately

    readAndSendSensorData();

    previousMillis = millis();

  }

}

// =====================================
// 9. MAIN LOOP
// =====================================

void loop() {

  connectWiFi();

  unsigned long currentMillis = millis();

  if (currentMillis - previousMillis >= sendInterval) {

    previousMillis = currentMillis;

    readAndSendSensorData();

  }

  delay(100);
}
