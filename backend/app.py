from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
import random
import time
from datetime import datetime, timedelta
from collections import deque

app = Flask(__name__)
CORS(app)

# ─── FIELD ZONES ───────────────────────────────────────────────────────────────
ZONES = {
    "Z1": {"name": "North Field",    "area_ha": 42.3, "crop": "Wheat",    "lat": 34.21, "lon": -117.43},
    "Z2": {"name": "South Orchard",  "area_ha": 28.7, "crop": "Almonds",  "lat": 34.19, "lon": -117.41},
    "Z3": {"name": "East Paddock",   "area_ha": 35.1, "crop": "Soybean",  "lat": 34.22, "lon": -117.40},
    "Z4": {"name": "West Greenhouse","area_ha": 12.0, "crop": "Tomatoes", "lat": 34.20, "lon": -117.45},
    "Z5": {"name": "Central Block",  "area_ha": 55.6, "crop": "Corn",     "lat": 34.21, "lon": -117.42},
}

DRONE_FLEET = [
    {"id": "UAV-01", "model": "DJI Agras T40", "type": "multispectral"},
    {"id": "UAV-02", "model": "Parrot Sequoia", "type": "hyperspectral"},
    {"id": "UAV-03", "model": "senseFly eBee", "type": "RGB+NIR"},
    {"id": "UAV-04", "model": "DJI Phantom 4", "type": "thermal"},
    {"id": "UAV-05", "model": "AgEagle RX60", "type": "multispectral"},
]

IOT_SENSORS = [
    {"id": "SOIL-01", "zone": "Z1", "type": "soil_moisture"},
    {"id": "SOIL-02", "zone": "Z2", "type": "soil_moisture"},
    {"id": "SOIL-03", "zone": "Z3", "type": "soil_npk"},
    {"id": "WEATH-01","zone": "Z1", "type": "weather_station"},
    {"id": "WEATH-02","zone": "Z5", "type": "weather_station"},
    {"id": "IRRIG-01","zone": "Z4", "type": "irrigation_ctrl"},
    {"id": "IRRIG-02","zone": "Z5", "type": "irrigation_ctrl"},
    {"id": "PEST-01", "zone": "Z2", "type": "pest_trap"},
    {"id": "PEST-02", "zone": "Z3", "type": "pest_trap"},
    {"id": "CAM-01",  "zone": "Z1", "type": "fixed_imaging"},
]

# ─── STATE ─────────────────────────────────────────────────────────────────────
history = {zid: deque(maxlen=48) for zid in ZONES}
alerts  = deque(maxlen=100)
scan_log = deque(maxlen=50)
t0 = time.time()

# Pretrained stub classifier for crop stress
rf_model = RandomForestClassifier(n_estimators=10, random_state=42)
gb_model = GradientBoostingRegressor(n_estimators=50, random_state=42)
_trained = False

def ensure_trained():
    global _trained
    if _trained: return
    # Synthetic training data: [ndvi, moisture, temp, humidity, n, p, k] -> stress class
    X = np.random.rand(300, 7)
    X[:, 0] = X[:, 0] * 0.9 + 0.05  # ndvi 0.05-0.95
    y_cls = (X[:, 0] < 0.4).astype(int) + (X[:, 2] > 0.8).astype(int)
    y_cls = np.clip(y_cls, 0, 2)  # 0=healthy,1=stressed,2=critical
    y_reg = 0.3 + 0.6 * (1 - X[:, 0]) + np.random.randn(300) * 0.05
    rf_model.fit(X, y_cls)
    gb_model.fit(X, np.clip(y_reg, 0, 1))
    _trained = True

ensure_trained()

# ─── SIMULATION HELPERS ────────────────────────────────────────────────────────
def simulate_ndvi(zone_id, t):
    base = {"Z1": 0.62, "Z2": 0.71, "Z3": 0.58, "Z4": 0.80, "Z5": 0.65}[zone_id]
    drift = 0.04 * np.sin(t / 120)
    noise = random.gauss(0, 0.015)
    # Z3 degrading over time as a scenario
    if zone_id == "Z3":
        drift -= min(0.15, (t % 600) / 4000)
    return round(max(0.05, min(0.95, base + drift + noise)), 3)

def simulate_soil(zone_id, t):
    moisture = round(random.gauss({"Z1":42,"Z2":38,"Z3":28,"Z4":65,"Z5":50}[zone_id], 4), 1)
    temp_c   = round(random.gauss({"Z1":22,"Z2":25,"Z3":27,"Z4":20,"Z5":24}[zone_id], 1.5), 1)
    ph       = round(random.gauss({"Z1":6.8,"Z2":7.1,"Z3":6.3,"Z4":6.6,"Z5":6.9}[zone_id], 0.15), 2)
    nitrogen = round(random.gauss({"Z1":180,"Z2":140,"Z3":95,"Z4":220,"Z5":160}[zone_id], 15))
    phosphorus = round(random.gauss(40, 6))
    potassium  = round(random.gauss(200, 20))
    return {"moisture_pct": moisture, "temp_c": temp_c, "ph": ph,
            "nitrogen_ppm": nitrogen, "phosphorus_ppm": phosphorus, "potassium_ppm": potassium}

def simulate_spectral(zone_id):
    ndvi_val = simulate_ndvi(zone_id, time.time() - t0)
    nir  = round(random.gauss(0.72, 0.04), 3)
    red  = round(random.gauss(0.18, 0.03), 3)
    green= round(random.gauss(0.14, 0.02), 3)
    swir = round(random.gauss(0.31, 0.05), 3)
    re   = round(random.gauss(0.45, 0.04), 3)  # red-edge
    ndre = round((nir - re) / (nir + re + 1e-6), 3)
    ndwi = round((green - nir) / (green + nir + 1e-6), 3)
    return {"ndvi": ndvi_val, "nir": nir, "red": red, "green": green,
            "swir": swir, "red_edge": re, "ndre": ndre, "ndwi": ndwi}

def simulate_weather(t):
    hour = (t / 3600) % 24
    temp = round(18 + 10 * np.sin((hour - 6) * np.pi / 12) + random.gauss(0, 1), 1)
    humidity = round(65 - 20 * np.sin((hour - 6) * np.pi / 12) + random.gauss(0, 3), 1)
    wind_kmh = round(abs(random.gauss(12, 4)), 1)
    precip   = round(max(0, random.gauss(0, 0.5)), 2) if random.random() < 0.1 else 0.0
    solar_w  = round(max(0, 800 * np.sin(max(0, (hour - 6)) * np.pi / 12) + random.gauss(0, 30)), 1)
    return {"temp_c": temp, "humidity_pct": humidity, "wind_kmh": wind_kmh,
            "precip_mm": precip, "solar_w_m2": solar_w}

def simulate_pest_risk(zone_id, soil, weather, ndvi_val):
    # Heuristic pest risk score 0-1
    risk = 0.0
    if weather["humidity_pct"] > 70: risk += 0.25
    if weather["temp_c"] > 26:       risk += 0.15
    if soil["moisture_pct"] > 55:    risk += 0.10
    if ndvi_val < 0.45:              risk += 0.20
    if zone_id in ["Z2", "Z3"]:      risk += 0.10  # higher-risk zones
    risk += random.gauss(0, 0.05)
    return round(max(0, min(1, risk)), 3)

def ml_stress_prediction(spectral, soil, weather):
    feat = np.array([[
        spectral["ndvi"],
        soil["moisture_pct"] / 100,
        weather["temp_c"] / 40,
        weather["humidity_pct"] / 100,
        soil["nitrogen_ppm"] / 300,
        soil["phosphorus_ppm"] / 80,
        soil["potassium_ppm"] / 400,
    ]])
    stress_class = int(rf_model.predict(feat)[0])
    stress_prob  = round(float(gb_model.predict(feat)[0]), 3)
    labels = {0: "HEALTHY", 1: "STRESSED", 2: "CRITICAL"}
    return {"class": stress_class, "label": labels[stress_class],
            "risk_score": stress_prob,
            "confidence": round(random.uniform(0.82, 0.97), 3)}

def drone_status(t):
    drones = []
    for i, d in enumerate(DRONE_FLEET):
        phase = (t + i * 120) % 600
        if phase < 300:
            status = "SCANNING"
            battery = round(90 - phase / 300 * 60, 1)
            zone = list(ZONES.keys())[i % len(ZONES)]
            progress = round(phase / 300 * 100, 1)
        elif phase < 360:
            status = "RETURNING"
            battery = round(30 + (phase - 300) / 60 * 5, 1)
            zone = "BASE"
            progress = 100.0
        else:
            status = "CHARGING"
            battery = round(35 + (phase - 360) / 240 * 65, 1)
            zone = "BASE"
            progress = 0.0
        drones.append({**d, "status": status, "battery_pct": battery,
                        "zone": zone, "scan_progress_pct": progress,
                        "altitude_m": round(random.uniform(45, 120)) if status == "SCANNING" else 0,
                        "speed_kmh": round(random.uniform(25, 55)) if status == "SCANNING" else 0,
                        "images_captured": random.randint(200, 1200) if status != "CHARGING" else 0})
    return drones

def check_alerts(zone_id, spectral, soil, pest_risk, stress):
    ts = datetime.utcnow().strftime("%H:%M:%S")
    zone_name = ZONES[zone_id]["name"]
    new = []
    if spectral["ndvi"] < 0.35:
        new.append({"zone": zone_id, "zone_name": zone_name, "type": "CROP_STRESS",
                    "msg": f"Critical NDVI {spectral['ndvi']} — severe crop stress detected",
                    "severity": "CRITICAL", "time": ts, "action": "Deploy UAV for detailed scan"})
    elif spectral["ndvi"] < 0.50:
        new.append({"zone": zone_id, "zone_name": zone_name, "type": "NDVI_LOW",
                    "msg": f"NDVI {spectral['ndvi']} below threshold — moderate stress",
                    "severity": "WARNING", "time": ts, "action": "Check irrigation schedule"})
    if soil["moisture_pct"] < 25:
        new.append({"zone": zone_id, "zone_name": zone_name, "type": "DROUGHT_RISK",
                    "msg": f"Soil moisture critically low: {soil['moisture_pct']}%",
                    "severity": "CRITICAL", "time": ts, "action": "Activate irrigation immediately"})
    if pest_risk > 0.65:
        new.append({"zone": zone_id, "zone_name": zone_name, "type": "PEST_ALERT",
                    "msg": f"High pest pressure detected — risk score {pest_risk:.2f}",
                    "severity": "WARNING", "time": ts, "action": "Schedule targeted treatment"})
    if soil["ph"] < 5.8 or soil["ph"] > 7.8:
        new.append({"zone": zone_id, "zone_name": zone_name, "type": "SOIL_PH",
                    "msg": f"Soil pH out of range: {soil['ph']}",
                    "severity": "INFO", "time": ts, "action": "Soil amendment recommended"})
    return new

# ─── ROUTES ────────────────────────────────────────────────────────────────────
@app.route("/api/field/overview")
def field_overview():
    t = time.time() - t0
    weather = simulate_weather(t)
    zones_data = {}
    all_alerts = []

    for zid, zinfo in ZONES.items():
        spectral   = simulate_spectral(zid)
        soil       = simulate_soil(zid, t)
        pest_risk  = simulate_pest_risk(zid, soil, weather, spectral["ndvi"])
        stress     = ml_stress_prediction(spectral, soil, weather)
        zone_alerts= check_alerts(zid, spectral, soil, pest_risk, stress)

        entry = {**zinfo, "zone_id": zid, "spectral": spectral, "soil": soil,
                 "pest_risk": pest_risk, "stress": stress, "alert_count": len(zone_alerts)}
        history[zid].append({"time": datetime.utcnow().isoformat(), "ndvi": spectral["ndvi"],
                              "moisture": soil["moisture_pct"], "pest_risk": pest_risk,
                              "stress_score": stress["risk_score"]})
        zones_data[zid] = entry
        all_alerts.extend(zone_alerts)

    for a in all_alerts:
        alerts.appendleft(a)

    return jsonify({
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "weather":   weather,
        "zones":     zones_data,
        "drones":    drone_status(t),
        "summary": {
            "total_area_ha":  sum(z["area_ha"] for z in ZONES.values()),
            "zones_healthy":  sum(1 for z in zones_data.values() if z["stress"]["label"] == "HEALTHY"),
            "zones_stressed": sum(1 for z in zones_data.values() if z["stress"]["label"] == "STRESSED"),
            "zones_critical": sum(1 for z in zones_data.values() if z["stress"]["label"] == "CRITICAL"),
            "avg_ndvi":       round(np.mean([z["spectral"]["ndvi"] for z in zones_data.values()]), 3),
            "avg_moisture":   round(np.mean([z["soil"]["moisture_pct"] for z in zones_data.values()]), 1),
            "avg_pest_risk":  round(np.mean([z["pest_risk"] for z in zones_data.values()]), 3),
            "active_alerts":  len(all_alerts),
            "drones_scanning":sum(1 for d in drone_status(t) if d["status"] == "SCANNING"),
        }
    })

@app.route("/api/zone/<zone_id>/history")
def zone_history(zone_id):
    if zone_id not in history:
        return jsonify({"error": "Zone not found"}), 404
    return jsonify({"zone_id": zone_id, "history": list(history[zone_id])})

@app.route("/api/alerts")
def get_alerts():
    limit = int(request.args.get("limit", 20))
    return jsonify({"alerts": list(alerts)[:limit], "total": len(alerts)})

@app.route("/api/spectral/scan", methods=["POST"])
def trigger_scan():
    body = request.get_json() or {}
    zone_id   = body.get("zone_id", "Z1")
    scan_type = body.get("type", "multispectral")
    drone_id  = body.get("drone_id", "UAV-01")
    if zone_id not in ZONES:
        return jsonify({"error": "Invalid zone"}), 400
    entry = {
        "scan_id":   f"SCN-{int(time.time())}",
        "zone_id":   zone_id,
        "zone_name": ZONES[zone_id]["name"],
        "drone_id":  drone_id,
        "type":      scan_type,
        "status":    "QUEUED",
        "eta_min":   random.randint(8, 25),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "bands":     ["NIR","RED","GREEN","RED-EDGE","SWIR"] if scan_type == "multispectral" else ["400-1000nm continuous"],
        "resolution_cm": 3 if scan_type == "multispectral" else 5,
    }
    scan_log.appendleft(entry)
    return jsonify(entry)

@app.route("/api/scans")
def get_scans():
    return jsonify({"scans": list(scan_log)[:10]})

@app.route("/api/recommend", methods=["POST"])
def recommend():
    body    = request.get_json() or {}
    zone_id = body.get("zone_id", "Z1")
    t = time.time() - t0
    spectral = simulate_spectral(zone_id)
    soil     = simulate_soil(zone_id, t)
    weather  = simulate_weather(t)
    stress   = ml_stress_prediction(spectral, soil, weather)
    pest_risk= simulate_pest_risk(zone_id, soil, weather, spectral["ndvi"])

    recs = []
    if spectral["ndvi"] < 0.50:
        recs.append({"priority": "HIGH",   "category": "Crop Health",  "action": "Increase nitrogen application by 15-20 kg/ha", "impact": "Est. +0.08 NDVI recovery in 10 days"})
    if soil["moisture_pct"] < 35:
        recs.append({"priority": "HIGH",   "category": "Irrigation",   "action": f"Apply {round(35-soil['moisture_pct'])*2} mm irrigation immediately", "impact": "Prevent yield loss up to 18%"})
    if pest_risk > 0.5:
        recs.append({"priority": "MEDIUM", "category": "Pest Control", "action": "Deploy targeted biopesticide spray", "impact": "Reduce pest pressure by 60-70%"})
    if soil["ph"] < 6.2:
        recs.append({"priority": "LOW",    "category": "Soil Health",  "action": "Apply agricultural lime 200 kg/ha", "impact": "pH correction within 3-4 weeks"})
    if weather["solar_w_m2"] > 600 and soil["moisture_pct"] < 40:
        recs.append({"priority": "MEDIUM", "category": "Scheduling",   "action": "Schedule next UAV scan at dawn to reduce thermal noise", "impact": "Improve spectral accuracy by ~12%"})
    if not recs:
        recs.append({"priority": "LOW", "category": "General", "action": "All parameters nominal — continue monitoring cycle", "impact": "Maintain current yield trajectory"})

    return jsonify({
        "zone_id": zone_id, "zone_name": ZONES[zone_id]["name"],
        "crop": ZONES[zone_id]["crop"],
        "ml_stress": stress, "recommendations": recs,
        "generated_at": datetime.utcnow().isoformat() + "Z"
    })

@app.route("/api/iot/sensors")
def sensor_status():
    t = time.time() - t0
    sensors = []
    for s in IOT_SENSORS:
        online = random.random() > 0.05
        battery= round(random.uniform(45, 98), 1)
        last_reading = (datetime.utcnow() - timedelta(seconds=random.randint(10, 120))).strftime("%H:%M:%S")
        sensors.append({**s, "online": online, "battery_pct": battery,
                        "signal_dbm": round(random.uniform(-85, -45), 1),
                        "last_reading": last_reading,
                        "readings_today": random.randint(288, 576)})
    return jsonify({"sensors": sensors, "online": sum(1 for s in sensors if s["online"]),
                    "total": len(sensors)})

@app.route("/api/status")
def status():
    return jsonify({"status": "online", "version": "2.1.0", "uptime_s": round(time.time() - t0)})

if __name__ == "__main__":
    app.run(debug=True, port=5000)