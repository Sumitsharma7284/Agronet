import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  Legend,
} from "recharts";

const API = "https://agronet-cchb.onrender.com";

/* ── PALETTE ───────────────────────────────────────────────────────────────── */
const C = {
  bg: "#070d05",
  card: "#0c1209",
  border: "#182414",
  border2: "#243620",
  soil: "#8B5E3C",
  leaf: "#4caf50",
  ndvi: "#76ff03",
  amber: "#ffb300",
  red: "#ef5350",
  blue: "#29b6f6",
  teal: "#26c6da",
  purple: "#ab47bc",
  text: "#c8e6c9",
  muted: "#558b2f",
  faint: "#1b2e18",
};

const ndviColor = (v) => (v >= 0.65 ? C.ndvi : v >= 0.45 ? C.amber : C.red);
const pestColor = (v) => (v >= 0.65 ? C.red : v >= 0.4 ? C.amber : C.leaf);
const stressColor = (l) =>
  ({ HEALTHY: C.ndvi, STRESSED: C.amber, CRITICAL: C.red })[l] || C.muted;

/* ── FONT INJECT ───────────────────────────────────────────────────────────── */
const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Unbounded:wght@300;400;600;700;900&family=DM+Sans:wght@300;400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:${C.bg};color:${C.text};font-family:'DM Sans',sans-serif;font-weight:300}
    ::-webkit-scrollbar{width:3px;height:3px}
    ::-webkit-scrollbar-track{background:${C.bg}}
    ::-webkit-scrollbar-thumb{background:${C.border2}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
    @keyframes scanline{0%{top:-10%}100%{top:110%}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes glow{0%,100%{box-shadow:0 0 6px ${C.ndvi}55}50%{box-shadow:0 0 18px ${C.ndvi}99}}
    .fade-up{animation:fadeUp .4s ease both}
    .card{background:${C.card};border:1px solid ${C.border};position:relative;overflow:hidden}
    .card::after{content:'';position:absolute;top:0;left:0;width:24px;height:24px;
      border-top:1px solid ${C.ndvi}66;border-left:1px solid ${C.ndvi}66;pointer-events:none}
    button{cursor:pointer;font-family:'DM Mono',monospace}
    button:hover{filter:brightness(1.15)}
    .tab-btn{padding:7px 18px;border:1px solid ${C.border2};background:transparent;
      color:${C.muted};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;transition:all .2s}
    .tab-btn.active{background:rgba(118,255,3,.08);border-color:${C.ndvi}88;color:${C.ndvi}}
  `}</style>
);

/* ── SMALL COMPONENTS ──────────────────────────────────────────────────────── */
const Label = ({ children, style }) => (
  <div
    style={{
      fontFamily: "'DM Mono',monospace",
      fontSize: 9,
      letterSpacing: 2,
      color: C.muted,
      textTransform: "uppercase",
      ...style,
    }}
  >
    {children}
  </div>
);

const Val = ({ children, color = C.text, size = 28, style }) => (
  <div
    style={{
      fontFamily: "'Unbounded',sans-serif",
      fontWeight: 600,
      fontSize: size,
      color,
      lineHeight: 1.1,
      ...style,
    }}
  >
    {children}
  </div>
);

const SectionTitle = ({ children, right }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    }}
  >
    <div
      style={{
        fontFamily: "'Unbounded',sans-serif",
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: 2,
        color: C.muted,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
    {right && (
      <div
        style={{
          fontFamily: "'DM Mono',monospace",
          fontSize: 9,
          color: C.border2,
        }}
      >
        {right}
      </div>
    )}
  </div>
);

const Pill = ({ children, color = C.ndvi }) => (
  <span
    style={{
      fontFamily: "'DM Mono',monospace",
      fontSize: 9,
      padding: "2px 8px",
      background: color + "22",
      border: `1px solid ${color}55`,
      color,
      letterSpacing: 1,
    }}
  >
    {children}
  </span>
);

const MiniBar = ({ value, max = 1, color = C.ndvi, height = 4 }) => (
  <div style={{ height, background: C.faint, flex: 1 }}>
    <div
      style={{
        height: "100%",
        width: `${Math.min(100, (value / max) * 100)}%`,
        background: color,
        transition: "width .7s ease",
      }}
    />
  </div>
);

const Spinner = () => (
  <div
    style={{
      width: 14,
      height: 14,
      border: `2px solid ${C.border2}`,
      borderTopColor: C.ndvi,
      borderRadius: "50%",
      animation: "spin .7s linear infinite",
    }}
  />
);

const CustomTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border2}`,
        padding: "10px 14px",
        fontFamily: "'DM Mono',monospace",
        fontSize: 10,
      }}
    >
      <div style={{ color: C.muted, marginBottom: 5 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}:{" "}
          <strong>
            {typeof p.value === "number" ? p.value.toFixed(3) : p.value}
          </strong>
        </div>
      ))}
    </div>
  );
};

/* ── NDVI HEATMAP GRID ─────────────────────────────────────────────────────── */
const NdviGrid = ({ zones }) => {
  if (!zones || !Object.keys(zones).length)
    return (
      <div
        style={{
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'DM Mono',monospace",
          fontSize: 10,
          color: C.border2,
        }}
      >
        AWAITING FIELD DATA...
      </div>
    );
  const cells = [];
  const zList = Object.values(zones).filter((z) => z?.spectral);
  // Build a 14×10 grid with zone-colored blocks + noise
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 14; c++) {
      const zi = Math.floor((r * 14 + c) / 20) % zList.length;
      const z = zList[zi];
      const ndvi = z.spectral.ndvi + (Math.random() - 0.5) * 0.12;
      const v = Math.max(0, Math.min(1, ndvi));
      const col =
        v > 0.65
          ? `hsl(${90 + v * 30},90%,${30 + v * 25}%)`
          : v > 0.45
            ? `hsl(${40 + v * 20},85%,${35 + v * 10}%)`
            : `hsl(${v * 20},80%,${20 + v * 20}%)`;
      cells.push(
        <div
          key={`${r}-${c}`}
          title={`${z.name} · NDVI ${v.toFixed(2)}`}
          style={{
            background: col,
            opacity: 0.75 + Math.random() * 0.25,
            transition: "background .5s",
            cursor: "pointer",
          }}
        />,
      );
    }
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(14,1fr)",
        gridTemplateRows: "repeat(10,1fr)",
        gap: 2,
        height: 180,
      }}
    >
      {cells}
    </div>
  );
};

/* ── DRONE CARD ────────────────────────────────────────────────────────────── */
const DroneCard = ({ drone }) => {
  const statusColor =
    { SCANNING: C.ndvi, RETURNING: C.amber, CHARGING: C.blue }[drone.status] ||
    C.muted;
  return (
    <div
      style={{
        padding: "12px 14px",
        background: C.faint,
        border: `1px solid ${C.border}`,
        borderLeft: `2px solid ${statusColor}`,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Unbounded',sans-serif",
              fontSize: 11,
              fontWeight: 600,
              color: statusColor,
            }}
          >
            {drone.id}
          </div>
          <div
            style={{
              fontFamily: "'DM Mono',monospace",
              fontSize: 9,
              color: C.muted,
              marginTop: 2,
            }}
          >
            {drone.model} · {drone.type.toUpperCase()}
          </div>
        </div>
        <Pill color={statusColor}>{drone.status}</Pill>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          marginBottom: 8,
        }}
      >
        {[
          [
            "BATTERY",
            `${drone.battery_pct}%`,
            drone.battery_pct < 30 ? C.red : C.ndvi,
          ],
          ["ALTITUDE", drone.altitude_m ? `${drone.altitude_m}m` : "—", C.blue],
          ["ZONE", drone.zone, C.teal],
        ].map(([l, v, c]) => (
          <div key={l}>
            <Label style={{ marginBottom: 2 }}>{l}</Label>
            <div
              style={{
                fontFamily: "'Unbounded',sans-serif",
                fontSize: 12,
                color: c,
                fontWeight: 600,
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>
      {drone.status === "SCANNING" && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 3,
            }}
          >
            <Label>SCAN PROGRESS</Label>
            <Label style={{ color: C.ndvi }}>{drone.scan_progress_pct}%</Label>
          </div>
          <MiniBar
            value={drone.scan_progress_pct}
            max={100}
            color={C.ndvi}
            height={3}
          />
        </div>
      )}
    </div>
  );
};

/* ── ZONE ROW ──────────────────────────────────────────────────────────────── */
const ZoneRow = ({ zone, selected, onClick }) => {
  const sc = stressColor(zone.stress?.label);
  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 14px",
        marginBottom: 6,
        cursor: "pointer",
        transition: "all .2s",
        background: selected ? `${sc}11` : C.faint,
        border: `1px solid ${selected ? sc + "66" : C.border}`,
        borderLeft: `3px solid ${sc}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Unbounded',sans-serif",
              fontSize: 11,
              fontWeight: 600,
              color: C.text,
            }}
          >
            {zone.name}
          </div>
          <div
            style={{
              fontFamily: "'DM Mono',monospace",
              fontSize: 9,
              color: C.muted,
              marginTop: 2,
            }}
          >
            {zone.zone_id} · {zone.crop} · {zone.area_ha} ha
          </div>
        </div>
        <Pill color={sc}>{zone.stress?.label}</Pill>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 8,
          marginTop: 10,
        }}
      >
        {[
          [
            "NDVI",
            zone.spectral?.ndvi?.toFixed(3),
            ndviColor(zone.spectral?.ndvi),
          ],
          [
            "MOISTURE",
            `${zone.soil?.moisture_pct}%`,
            zone.soil?.moisture_pct < 30 ? C.red : C.blue,
          ],
          [
            "PEST RISK",
            `${(zone.pest_risk * 100).toFixed(0)}%`,
            pestColor(zone.pest_risk),
          ],
        ].map(([l, v, c]) => (
          <div key={l}>
            <Label style={{ marginBottom: 2 }}>{l}</Label>
            <div
              style={{
                fontFamily: "'Unbounded',sans-serif",
                fontSize: 13,
                color: c,
                fontWeight: 700,
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── ZONE DETAIL ───────────────────────────────────────────────────────────── */
const ZoneDetail = ({
  zone,
  history,
  onScan,
  onRecommend,
  recommendations,
  recLoading,
}) => {
  if (!zone)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: C.border2,
          fontFamily: "'DM Mono',monospace",
          fontSize: 11,
        }}
      >
        SELECT A ZONE TO INSPECT
      </div>
    );

  const spectral = zone.spectral || {};
  const soil = zone.soil || {};
  const stress = zone.stress || {};

  const radarData = [
    { axis: "NDVI", value: spectral.ndvi || 0 },
    { axis: "NIR", value: spectral.nir || 0 },
    { axis: "Moisture", value: (soil.moisture_pct || 0) / 100 },
    { axis: "Nitrogen", value: (soil.nitrogen_ppm || 0) / 300 },
    { axis: "NDRE", value: Math.abs(spectral.ndre || 0) },
    { axis: "NDWI", value: Math.abs(spectral.ndwi || 0) },
  ];

  const histData = history.map((h, i) => ({
    t: i,
    ndvi: h.ndvi,
    moisture: h.moisture / 100,
    pest: h.pest_risk,
    stress: h.stress_score,
  }));

  const sc = stressColor(stress.label);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        height: "100%",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Unbounded',sans-serif",
              fontWeight: 700,
              fontSize: 18,
              color: C.text,
            }}
          >
            {zone.name}
          </div>
          <div
            style={{
              fontFamily: "'DM Mono',monospace",
              fontSize: 10,
              color: C.muted,
              marginTop: 3,
            }}
          >
            {zone.crop} · {zone.area_ha} ha · {zone.zone_id}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="tab-btn"
            onClick={() => onScan(zone.zone_id)}
            style={{ color: C.blue, borderColor: C.blue + "55" }}
          >
            ◉ SCAN
          </button>
          <button
            className="tab-btn"
            onClick={() => onRecommend(zone.zone_id)}
            style={{ color: C.ndvi, borderColor: C.ndvi + "55" }}
          >
            {recLoading ? "..." : "⚙ RECOMMEND"}
          </button>
        </div>
      </div>

      {/* Stress badge */}
      <div
        style={{
          padding: "10px 16px",
          background: sc + "15",
          border: `1px solid ${sc}44`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <Label>ML CROP STRESS ASSESSMENT</Label>
          <div
            style={{
              fontFamily: "'Unbounded',sans-serif",
              fontSize: 20,
              fontWeight: 700,
              color: sc,
              marginTop: 4,
            }}
          >
            {stress.label}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <Label>RISK SCORE</Label>
          <div
            style={{
              fontFamily: "'Unbounded',sans-serif",
              fontSize: 28,
              fontWeight: 700,
              color: sc,
            }}
          >
            {((stress.risk_score || 0) * 100).toFixed(0)}
            <span style={{ fontSize: 12, color: C.muted }}>%</span>
          </div>
          <Label style={{ marginTop: 2, color: C.border2 }}>
            CONF. {((stress.confidence || 0) * 100).toFixed(0)}%
          </Label>
        </div>
      </div>

      {/* Spectral + Radar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Spectral bands */}
        <div className="card" style={{ padding: "14px 16px" }}>
          <SectionTitle>Spectral Bands</SectionTitle>
          {[
            ["NDVI", spectral.ndvi, 1, ndviColor(spectral.ndvi)],
            ["NIR", spectral.nir, 1, C.purple],
            ["RED EDGE", spectral.red_edge, 1, C.red],
            ["NDRE", Math.abs(spectral.ndre || 0), 1, C.teal],
            ["SWIR", spectral.swir, 1, C.amber],
            ["NDWI", Math.abs(spectral.ndwi || 0), 1, C.blue],
          ].map(([l, v, max, col]) => (
            <div key={l} style={{ marginBottom: 9 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 3,
                }}
              >
                <Label>{l}</Label>
                <span
                  style={{
                    fontFamily: "'Unbounded',monospace",
                    fontSize: 11,
                    color: col,
                    fontWeight: 600,
                  }}
                >
                  {(v || 0).toFixed(3)}
                </span>
              </div>
              <MiniBar value={v || 0} max={max} color={col} height={3} />
            </div>
          ))}
        </div>

        {/* Radar */}
        <div className="card" style={{ padding: "14px 16px" }}>
          <SectionTitle>Spectral Signature</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={C.border2} />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fill: C.muted, fontSize: 9, fontFamily: "DM Mono" }}
              />
              <Radar
                dataKey="value"
                stroke={C.ndvi}
                fill={C.ndvi}
                fillOpacity={0.15}
                strokeWidth={1.5}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Soil data */}
      <div className="card" style={{ padding: "14px 16px" }}>
        <SectionTitle>Soil Conditions</SectionTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 12,
          }}
        >
          {[
            [
              "MOISTURE",
              `${soil.moisture_pct}%`,
              soil.moisture_pct < 30 ? C.red : C.blue,
            ],
            [
              "TEMPERATURE",
              `${soil.temp_c}°C`,
              soil.temp_c > 30 ? C.amber : C.text,
            ],
            ["pH", soil.ph, soil.ph < 5.8 || soil.ph > 7.8 ? C.amber : C.ndvi],
            [
              "NITROGEN",
              `${soil.nitrogen_ppm} ppm`,
              soil.nitrogen_ppm < 120 ? C.amber : C.ndvi,
            ],
            ["PHOSPHORUS", `${soil.phosphorus_ppm} ppm`, C.teal],
            ["POTASSIUM", `${soil.potassium_ppm} ppm`, C.purple],
          ].map(([l, v, c]) => (
            <div
              key={l}
              style={{
                padding: "10px 12px",
                background: C.faint,
                border: `1px solid ${C.border}`,
              }}
            >
              <Label style={{ marginBottom: 5 }}>{l}</Label>
              <div
                style={{
                  fontFamily: "'Unbounded',sans-serif",
                  fontSize: 16,
                  fontWeight: 600,
                  color: c,
                }}
              >
                {v}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trend chart */}
      {histData.length > 2 && (
        <div className="card" style={{ padding: "14px 16px" }}>
          <SectionTitle right={`${histData.length} readings`}>
            Zone Health Trend
          </SectionTitle>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={histData}>
              <defs>
                <linearGradient id="ndviGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.ndvi} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={C.ndvi} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke={C.faint} />
              <XAxis hide />
              <YAxis
                domain={[0, 1]}
                tick={{ fill: C.muted, fontSize: 8, fontFamily: "DM Mono" }}
                tickLine={false}
              />
              <Tooltip content={<CustomTip />} />
              <Area
                type="monotone"
                dataKey="ndvi"
                name="NDVI"
                stroke={C.ndvi}
                fill="url(#ndviGrad)"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="pest"
                name="Pest Risk"
                stroke={C.red}
                strokeWidth={1}
                dot={false}
                strokeDasharray="3 3"
              />
              <Line
                type="monotone"
                dataKey="moisture"
                name="Moisture"
                stroke={C.blue}
                strokeWidth={1}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recommendations */}
      {recommendations && (
        <div className="card" style={{ padding: "14px 16px" }}>
          <SectionTitle>AI Recommendations</SectionTitle>
          {recommendations.recommendations?.map((r, i) => {
            const pc =
              { HIGH: C.red, MEDIUM: C.amber, LOW: C.ndvi }[r.priority] ||
              C.muted;
            return (
              <div
                key={i}
                style={{
                  padding: "10px 12px",
                  marginBottom: 8,
                  background: pc + "0d",
                  border: `1px solid ${pc}33`,
                  borderLeft: `3px solid ${pc}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 5,
                  }}
                >
                  <Pill color={pc}>{r.priority}</Pill>
                  <Label>{r.category}</Label>
                </div>
                <div style={{ fontSize: 12, color: C.text, marginBottom: 3 }}>
                  {r.action}
                </div>
                <div
                  style={{
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 9,
                    color: C.muted,
                  }}
                >
                  {r.impact}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ── ALERT LOG ─────────────────────────────────────────────────────────────── */
const AlertLog = ({ alerts }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 6,
      maxHeight: 280,
      overflowY: "auto",
    }}
  >
    {!alerts?.length && (
      <div
        style={{
          textAlign: "center",
          padding: "24px 0",
          fontFamily: "'DM Mono',monospace",
          fontSize: 10,
          color: C.border2,
        }}
      >
        ✓ ALL SYSTEMS NOMINAL
      </div>
    )}
    {alerts?.map((a, i) => {
      const c =
        { CRITICAL: C.red, WARNING: C.amber, INFO: C.blue }[a.severity] ||
        C.muted;
      return (
        <div
          key={i}
          style={{
            padding: "9px 12px",
            background: c + "0d",
            border: `1px solid ${c}33`,
            borderLeft: `3px solid ${c}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 3,
            }}
          >
            <Pill color={c}>{a.severity}</Pill>
            <span
              style={{
                fontFamily: "'DM Mono',monospace",
                fontSize: 9,
                color: C.border2,
              }}
            >
              {a.time} · {a.zone_name}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.text, marginBottom: 3 }}>
            {a.msg}
          </div>
          <div
            style={{
              fontFamily: "'DM Mono',monospace",
              fontSize: 9,
              color: C.muted,
            }}
          >
            → {a.action}
          </div>
        </div>
      );
    })}
  </div>
);

/* ── IOT SENSOR LIST ───────────────────────────────────────────────────────── */
const SensorList = ({ sensors }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 5,
      maxHeight: 320,
      overflowY: "auto",
    }}
  >
    {sensors?.map((s) => (
      <div
        key={s.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 10px",
          background: C.faint,
          border: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: s.online ? C.ndvi : C.red,
            boxShadow: s.online ? `0 0 6px ${C.ndvi}` : "none",
            animation: s.online ? "pulse 2s infinite" : "none",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: "'DM Mono',monospace",
              fontSize: 10,
              color: C.text,
            }}
          >
            {s.id}
          </div>
          <div
            style={{
              fontFamily: "'DM Mono',monospace",
              fontSize: 8,
              color: C.muted,
            }}
          >
            {s.type.replace(/_/g, " ")} · Zone {s.zone}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontFamily: "'Unbounded',sans-serif",
              fontSize: 11,
              color: s.battery_pct < 30 ? C.amber : C.muted,
              fontWeight: 600,
            }}
          >
            {s.battery_pct}%
          </div>
          <div
            style={{
              fontFamily: "'DM Mono',monospace",
              fontSize: 8,
              color: C.border2,
            }}
          >
            {s.signal_dbm} dBm
          </div>
        </div>
      </div>
    ))}
  </div>
);

/* ── MAIN APP ──────────────────────────────────────────────────────────────── */
export default function App() {
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [sensors, setSensors] = useState([]);
  const [zoneHistory, setZoneHistory] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [recommendations, setRecs] = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  const [tab, setTab] = useState("overview");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scans, setScans] = useState([]);

  const fetchMain = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/field/overview`);
      setData(r.data);
      setConnected(true);
      setLoading(false);
    } catch {
      setConnected(false);
      setLoading(false);
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/alerts?limit=25`);
      setAlerts(r.data.alerts || []);
    } catch {}
  }, []);

  const fetchSensors = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/iot/sensors`);
      setSensors(r.data.sensors || []);
    } catch {}
  }, []);

  const fetchZoneHistory = useCallback(async (zid) => {
    try {
      const r = await axios.get(`${API}/zone/${zid}/history`);
      setZoneHistory(r.data.history || []);
    } catch {}
  }, []);

  const handleSelectZone = async (zid) => {
    setSelectedZone(zid);
    setRecs(null);
    await fetchZoneHistory(zid);
  };

  const handleScan = async (zid) => {
    try {
      const drones = data?.drones || [];
      const avail = drones.find((d) => d.status === "CHARGING") || drones[0];
      await axios.post(`${API}/spectral/scan`, {
        zone_id: zid,
        type: "multispectral",
        drone_id: avail?.id || "UAV-01",
      });
      const r = await axios.get(`${API}/scans`);
      setScans(r.data.scans || []);
    } catch {}
  };

  const handleRecommend = async (zid) => {
    setRecLoading(true);
    try {
      const r = await axios.post(`${API}/recommend`, { zone_id: zid });
      setRecs(r.data);
    } catch {}
    setRecLoading(false);
  };

  useEffect(() => {
    fetchMain();
    fetchAlerts();
    fetchSensors();
    const id1 = setInterval(fetchMain, 3500);
    const id2 = setInterval(fetchAlerts, 6000);
    const id3 = setInterval(fetchSensors, 10000);
    return () => {
      clearInterval(id1);
      clearInterval(id2);
      clearInterval(id3);
    };
  }, [fetchMain, fetchAlerts, fetchSensors]);

  useEffect(() => {
    if (selectedZone) fetchZoneHistory(selectedZone);
  }, [data, selectedZone, fetchZoneHistory]);

  const summary = data?.summary || {};
  const weather = data?.weather || {};
  const zones = data?.zones || {};
  const drones = data?.drones || [];
  const selZone = selectedZone ? zones[selectedZone] : null;
  const critAlerts = alerts.filter((a) => a.severity === "CRITICAL").length;

  // Bar chart data for NDVI comparison
  const ndviBarData = Object.values(zones)
    .filter((z) => z?.spectral && z?.soil)
    .map((z) => ({
      name: z.zone_id,
      ndvi: z.spectral?.ndvi ?? 0,
      crop: z.crop,
      pest: z.pest_risk ?? 0,
      moisture: (z.soil?.moisture_pct ?? 0) / 100,
    }));

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <GlobalStyle />

      {/* ── TOPBAR ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          background: "rgba(7,13,5,.95)",
          borderBottom: `1px solid ${C.border}`,
          position: "sticky",
          top: 0,
          zIndex: 300,
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            fontFamily: "'Unbounded',sans-serif",
            fontWeight: 900,
            fontSize: 17,
            letterSpacing: 3,
            color: C.ndvi,
          }}
        >
          AGRO<span style={{ color: C.muted, fontWeight: 300 }}>SENSE</span>
          <span
            style={{
              fontSize: 9,
              color: C.border2,
              fontWeight: 300,
              marginLeft: 10,
            }}
          >
            AI FIELD INTELLIGENCE
          </span>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {[
            ["overview", "OVERVIEW"],
            ["drones", "DRONE FLEET"],
            ["sensors", "IOT SENSORS"],
            ["alerts", "ALERTS"],
            ["scans", "SCAN LOG"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`tab-btn ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              {id === "alerts" && critAlerts > 0
                ? `⚠ ALERTS (${critAlerts})`
                : label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {weather.temp_c && (
            <div
              style={{
                fontFamily: "'DM Mono',monospace",
                fontSize: 10,
                color: C.muted,
              }}
            >
              {weather.temp_c}°C · {weather.humidity_pct}% RH ·{" "}
              {weather.wind_kmh} km/h
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "'DM Mono',monospace",
              fontSize: 10,
              color: connected ? C.ndvi : C.red,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: connected ? C.ndvi : C.red,
                boxShadow: `0 0 8px ${connected ? C.ndvi : C.red}`,
                animation: "pulse 2s infinite",
              }}
            />
            {connected ? "LIVE" : "OFFLINE"}
          </div>
          {loading && <Spinner />}
        </div>
      </div>

      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      <div style={{ padding: "20px 28px", maxWidth: 1700, margin: "0 auto" }}>
        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <>
            {/* KPI ROW */}
            <div
              style={{
                display: "flex",
                gap: 1,
                background: C.border,
                marginBottom: 18,
                border: `1px solid ${C.border}`,
              }}
              className="fade-up"
            >
              {[
                ["TOTAL AREA", `${summary.total_area_ha} ha`, C.text],
                ["ZONES HEALTHY", summary.zones_healthy, C.ndvi],
                ["ZONES STRESSED", summary.zones_stressed, C.amber],
                ["ZONES CRITICAL", summary.zones_critical, C.red],
                [
                  "AVG NDVI",
                  summary.avg_ndvi,
                  ndviColor(summary.avg_ndvi || 0),
                ],
                ["AVG MOISTURE", `${summary.avg_moisture}%`, C.blue],
                [
                  "PEST PRESSURE",
                  `${((summary.avg_pest_risk || 0) * 100).toFixed(0)}%`,
                  pestColor(summary.avg_pest_risk || 0),
                ],
                ["DRONES ACTIVE", summary.drones_scanning, C.teal],
                [
                  "ACTIVE ALERTS",
                  summary.active_alerts,
                  summary.active_alerts > 0 ? C.red : C.ndvi,
                ],
              ].map(([l, v, c]) => (
                <div
                  key={l}
                  style={{
                    flex: 1,
                    background: C.card,
                    padding: "16px 18px",
                    borderTop: `2px solid ${c}`,
                  }}
                >
                  <Label style={{ marginBottom: 6 }}>{l}</Label>
                  <Val color={c} size={22}>
                    {v ?? "—"}
                  </Val>
                </div>
              ))}
            </div>

            {/* MAIN GRID */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "320px 1fr 340px",
                gap: 16,
              }}
            >
              {/* LEFT — Zone List */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                <div className="card fade-up" style={{ padding: "14px 16px" }}>
                  <SectionTitle right={`${Object.keys(zones).length} ZONES`}>
                    Field Zones
                  </SectionTitle>
                  {Object.values(zones)
                    .filter((z) => z?.spectral && z?.soil && z?.stress)
                    .map((z) => (
                      <ZoneRow
                        key={z.zone_id}
                        zone={z}
                        selected={selectedZone === z.zone_id}
                        onClick={() => handleSelectZone(z.zone_id)}
                      />
                    ))}
                </div>
              </div>

              {/* CENTER — Zone Detail + NDVI map */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                {/* NDVI heatmap */}
                <div className="card fade-up" style={{ padding: "14px 16px" }}>
                  <SectionTitle right="LIVE COMPOSITE">
                    NDVI Field Map — All Zones
                  </SectionTitle>
                  <NdviGrid zones={zones} />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 10,
                      fontFamily: "'DM Mono',monospace",
                      fontSize: 8,
                      color: C.muted,
                    }}
                  >
                    <div
                      style={{ width: 10, height: 10, background: "#b71c1c" }}
                    />{" "}
                    CRITICAL &lt;0.35
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        background: "#f57f17",
                        marginLeft: 8,
                      }}
                    />{" "}
                    STRESSED 0.35–0.50
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        background: "#558b2f",
                        marginLeft: 8,
                      }}
                    />{" "}
                    MODERATE 0.50–0.65
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        background: "#76ff03",
                        marginLeft: 8,
                      }}
                    />{" "}
                    HEALTHY &gt;0.65
                  </div>
                </div>

                {/* Zone NDVI bar comparison */}
                <div className="card fade-up" style={{ padding: "14px 16px" }}>
                  <SectionTitle>
                    Zone Comparison — NDVI · Pest Risk · Moisture
                  </SectionTitle>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={ndviBarData} barGap={2}>
                      <CartesianGrid strokeDasharray="2 6" stroke={C.faint} />
                      <XAxis
                        dataKey="name"
                        tick={{
                          fill: C.muted,
                          fontSize: 9,
                          fontFamily: "DM Mono",
                        }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 1]}
                        tick={{
                          fill: C.muted,
                          fontSize: 9,
                          fontFamily: "DM Mono",
                        }}
                        tickLine={false}
                      />
                      <Tooltip content={<CustomTip />} />
                      <Legend
                        wrapperStyle={{
                          fontFamily: "DM Mono",
                          fontSize: 9,
                          color: C.muted,
                        }}
                      />
                      <Bar
                        dataKey="ndvi"
                        name="NDVI"
                        fill={C.ndvi}
                        radius={0}
                        opacity={0.9}
                      >
                        {ndviBarData.map((d, i) => (
                          <Cell key={i} fill={ndviColor(d.ndvi)} />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="pest"
                        name="Pest Risk"
                        fill={C.red}
                        radius={0}
                        opacity={0.6}
                      />
                      <Bar
                        dataKey="moisture"
                        name="Moisture"
                        fill={C.blue}
                        radius={0}
                        opacity={0.6}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Zone Detail */}
                <div
                  className="card fade-up"
                  style={{ padding: "14px 16px", minHeight: 300 }}
                >
                  <ZoneDetail
                    zone={selZone}
                    history={zoneHistory}
                    onScan={handleScan}
                    onRecommend={handleRecommend}
                    recommendations={recommendations}
                    recLoading={recLoading}
                  />
                </div>
              </div>

              {/* RIGHT — Alerts + Weather */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                {/* Weather */}
                <div className="card fade-up" style={{ padding: "14px 16px" }}>
                  <SectionTitle>Weather Station</SectionTitle>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    {[
                      ["TEMP", `${weather.temp_c}°C`, C.amber],
                      ["HUMIDITY", `${weather.humidity_pct}%`, C.blue],
                      ["WIND", `${weather.wind_kmh} km/h`, C.teal],
                      ["SOLAR", `${weather.solar_w_m2} W/m²`, C.ndvi],
                      ["PRECIP", `${weather.precip_mm} mm`, C.purple],
                    ].map(([l, v, c]) => (
                      <div
                        key={l}
                        style={{
                          padding: "10px",
                          background: C.faint,
                          border: `1px solid ${C.border}`,
                        }}
                      >
                        <Label style={{ marginBottom: 4 }}>{l}</Label>
                        <Val size={16} color={c}>
                          {v}
                        </Val>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Alerts */}
                <div
                  className="card fade-up"
                  style={{ padding: "14px 16px", flex: 1 }}
                >
                  <SectionTitle right={`${alerts.length} EVENTS`}>
                    {critAlerts > 0
                      ? `⚠ ALERTS — ${critAlerts} CRITICAL`
                      : "Field Alerts"}
                  </SectionTitle>
                  <AlertLog alerts={alerts.slice(0, 10)} />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── DRONE FLEET TAB ──────────────────────────────────────────────── */}
        {tab === "drones" && (
          <div className="fade-up">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 14,
                marginBottom: 16,
              }}
            >
              {[
                [
                  "SCANNING",
                  drones.filter((d) => d.status === "SCANNING").length,
                  C.ndvi,
                ],
                [
                  "RETURNING",
                  drones.filter((d) => d.status === "RETURNING").length,
                  C.amber,
                ],
                [
                  "CHARGING",
                  drones.filter((d) => d.status === "CHARGING").length,
                  C.blue,
                ],
              ].map(([l, v, c]) => (
                <div
                  key={l}
                  className="card"
                  style={{ padding: "18px 20px", borderTop: `2px solid ${c}` }}
                >
                  <Label style={{ marginBottom: 6 }}>{l}</Label>
                  <Val size={40} color={c}>
                    {v}
                  </Val>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2,1fr)",
                gap: 14,
              }}
            >
              {drones.map((d) => (
                <DroneCard key={d.id} drone={d} />
              ))}
            </div>
          </div>
        )}

        {/* ── IOT SENSORS TAB ──────────────────────────────────────────────── */}
        {tab === "sensors" && (
          <div className="fade-up">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 14,
                marginBottom: 16,
              }}
            >
              {[
                [
                  "ONLINE SENSORS",
                  sensors.filter((s) => s.online).length,
                  C.ndvi,
                ],
                [
                  "OFFLINE SENSORS",
                  sensors.filter((s) => !s.online).length,
                  C.red,
                ],
                ["TOTAL SENSORS", sensors.length, C.muted],
              ].map(([l, v, c]) => (
                <div
                  key={l}
                  className="card"
                  style={{ padding: "18px 20px", borderTop: `2px solid ${c}` }}
                >
                  <Label style={{ marginBottom: 6 }}>{l}</Label>
                  <Val size={40} color={c}>
                    {v}
                  </Val>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: "16px 18px" }}>
              <SectionTitle right={`${sensors.length} DEVICES`}>
                IoT Sensor Fleet
              </SectionTitle>
              <SensorList sensors={sensors} />
            </div>
          </div>
        )}

        {/* ── ALERTS TAB ───────────────────────────────────────────────────── */}
        {tab === "alerts" && (
          <div className="fade-up">
            <div className="card" style={{ padding: "16px 18px" }}>
              <SectionTitle right={`${alerts.length} TOTAL`}>
                Field Alert Log
              </SectionTitle>
              <AlertLog alerts={alerts} />
            </div>
          </div>
        )}

        {/* ── SCAN LOG TAB ─────────────────────────────────────────────────── */}
        {tab === "scans" && (
          <div className="fade-up">
            <div className="card" style={{ padding: "16px 18px" }}>
              <SectionTitle right={`${scans.length} QUEUED`}>
                Spectral Scan Queue
              </SectionTitle>
              {!scans.length && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 0",
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 10,
                    color: C.border2,
                  }}
                >
                  NO SCANS QUEUED — SELECT A ZONE AND CLICK ◉ SCAN
                </div>
              )}
              {scans.map((s) => (
                <div
                  key={s.scan_id}
                  style={{
                    padding: "12px 14px",
                    marginBottom: 8,
                    background: C.faint,
                    border: `1px solid ${C.border}`,
                    borderLeft: `3px solid ${C.teal}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'DM Mono',monospace",
                        fontSize: 11,
                        color: C.teal,
                      }}
                    >
                      {s.scan_id}
                    </div>
                    <Pill color={C.amber}>{s.status}</Pill>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4,1fr)",
                      gap: 10,
                    }}
                  >
                    {[
                      ["ZONE", s.zone_name],
                      ["DRONE", s.drone_id],
                      ["TYPE", s.type],
                      ["ETA", `${s.eta_min} min`],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <Label style={{ marginBottom: 2 }}>{l}</Label>
                        <div
                          style={{
                            fontFamily: "'Unbounded',sans-serif",
                            fontSize: 11,
                            color: C.text,
                            fontWeight: 600,
                          }}
                        >
                          {v}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontFamily: "'DM Mono',monospace",
                      fontSize: 9,
                      color: C.muted,
                    }}
                  >
                    BANDS: {s.bands?.join(" · ")} · RES: {s.resolution_cm}cm/px
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
