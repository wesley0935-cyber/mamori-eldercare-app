import React, {useState, useEffect, useMemo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {
  getMockWeekSteps,
  getMockDaySteps,
  getMockMonthSteps,
} from '../services/StepTrendService';
import {
  getThresholdSettings,
  THRESHOLD_DEFAULTS,
} from '../services/ThresholdSettingsService';

// ─── 色票 ──────────────────────────────────────────────────────────────────────
const C = {
  green:  '#6E8E5E',
  orange: '#C98520',
  indigo: '#274A6E',
  cardBg: '#FAF6E8',
  border: '#DCD3B8',
  sub:    '#888888',
  dim:    '#AAAAAA',
};

// ─── 型別 ──────────────────────────────────────────────────────────────────────
type ViewMode = 'day' | 'week' | 'month';

interface BarItem {
  label: string;
  label2?: string;
  value: number;
  isToday: boolean;
  dateSub: string;
}

// ─── 工具函式 ──────────────────────────────────────────────────────────────────
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function fmtNum(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function shortNum(n: number): string {
  if (n === 0) {return '';}
  if (n >= 1000) {return `${(n / 1000).toFixed(1)}k`;}
  return String(n);
}

function barColor(item: BarItem, mode: ViewMode, goal: number): string {
  if (mode === 'day') {return C.indigo;}
  if (item.isToday) {return C.indigo;}
  return item.value >= goal ? C.green : C.orange;
}

// ─── 資料轉換 ─────────────────────────────────────────────────────────────────
function buildWeekBars(pairCode: string): BarItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return getMockWeekSteps(pairCode).map(({date, steps}) => {
    const wd = WEEKDAYS[date.getDay()];
    const ds = `${date.getMonth() + 1}/${date.getDate()}`;
    return {
      label: wd,
      label2: ds,
      value: steps,
      isToday: date.getTime() === today.getTime(),
      dateSub: `${ds}（${wd}）`,
    };
  });
}

function buildDayBars(pairCode: string): BarItem[] {
  const raw = getMockDaySteps(pairCode);
  return Array.from({length: 12}, (_, i) => {
    const h = i * 2;
    const val = raw[h].steps + (raw[h + 1]?.steps ?? 0);
    return {
      label: `${h}時`,
      value: val,
      isToday: true,
      dateSub: `${h}時`,
    };
  });
}

function buildMonthBars(pairCode: string): BarItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return getMockMonthSteps(pairCode).map(({date, steps}) => {
    const day = date.getDate();
    return {
      label: String(day),
      value: steps,
      isToday: date.getTime() === today.getTime(),
      dateSub: `${date.getMonth() + 1}/${day}`,
    };
  });
}

// ─── 統計摘要 ─────────────────────────────────────────────────────────────────
interface Stats {
  primary: string;
  max: string;
  min: string;
}

function calcStats(bars: BarItem[], mode: ViewMode): Stats {
  const active = bars.filter(b => b.value > 0);
  if (active.length === 0) {
    return {primary: '尚無數據', max: '--', min: '--'};
  }
  const maxBar = active.reduce((a, b) => (b.value > a.value ? b : a));
  const minBar = active.reduce((a, b) => (b.value < a.value ? b : a));

  if (mode === 'day') {
    const total = active.reduce((s, b) => s + b.value, 0);
    return {
      primary: `今日合計 ${fmtNum(total)} 步`,
      max: `${fmtNum(maxBar.value)} 步（${maxBar.dateSub}）`,
      min: `${fmtNum(minBar.value)} 步（${minBar.dateSub}）`,
    };
  }
  const avg = Math.round(active.reduce((s, b) => s + b.value, 0) / active.length);
  return {
    primary: `平均 ${fmtNum(avg)} 步/天`,
    max: `${fmtNum(maxBar.value)} 步（${maxBar.dateSub}）`,
    min: `${fmtNum(minBar.value)} 步（${minBar.dateSub}）`,
  };
}

// ─── 長條圖區塊 ───────────────────────────────────────────────────────────────
const BAR_H = 120;
const LABEL_H = 30;
const VAL_LABEL_H = 14;
const COLUMN_H = VAL_LABEL_H + BAR_H + LABEL_H;

function BarColumns({
  bars,
  barWidth,
  barGap,
  viewMode,
  stepGoal,
}: {
  bars: BarItem[];
  barWidth: number;
  barGap: number;
  viewMode: ViewMode;
  stepGoal: number;
}) {
  const maxVal = Math.max(...bars.map(b => b.value), 1);

  return (
    <View style={{flexDirection: 'row'}}>
      {bars.map((bar, idx) => {
        const bh = Math.max(4, (bar.value / maxVal) * BAR_H);
        const color = barColor(bar, viewMode, stepGoal);
        const showVal = viewMode !== 'month' && bar.value > 0;
        const isLast = idx === bars.length - 1;

        return (
          <View
            key={idx}
            style={{
              width: barWidth,
              height: COLUMN_H,
              marginRight: isLast ? 0 : barGap,
            }}>
            {/* 值標籤 — 恰好位於長條頂部 */}
            {showVal && (
              <Text
                style={[
                  s.valLabel,
                  {
                    position: 'absolute',
                    bottom: LABEL_H + bh + 1,
                    width: barWidth,
                    textAlign: 'center',
                  },
                ]}
                numberOfLines={1}>
                {shortNum(bar.value)}
              </Text>
            )}

            {/* 長條 */}
            <View
              style={{
                position: 'absolute',
                bottom: LABEL_H,
                left: 0,
                right: 0,
                height: BAR_H,
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}>
              <View
                style={{
                  width: Math.max(barWidth * 0.7, 4),
                  height: bh,
                  backgroundColor: color,
                  borderRadius: 3,
                }}
              />
            </View>

            {/* X 軸標籤 */}
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                height: LABEL_H,
                width: barWidth,
                alignItems: 'center',
                justifyContent: 'flex-start',
                paddingTop: 5,
              }}>
              <Text
                style={s.xLabel}
                numberOfLines={1}>
                {bar.label}
              </Text>
              {bar.label2 != null && (
                <Text style={s.xLabel2} numberOfLines={1}>
                  {bar.label2}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── 統計列 ───────────────────────────────────────────────────────────────────
function StatRow({stats}: {stats: Stats}) {
  return (
    <View style={s.statsRow}>
      <Text style={s.statPrimary}>{stats.primary}</Text>
      <View style={s.statSubRow}>
        <Text style={s.statSub}>▲ {stats.max}</Text>
        <Text style={[s.statSub, {marginLeft: 12}]}>▼ {stats.min}</Text>
      </View>
    </View>
  );
}

// ─── 主元件 ───────────────────────────────────────────────────────────────────
interface Props {
  pairCode: string;
}

export default function StepTrendChart({pairCode}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [stepGoal, setStepGoal] = useState(THRESHOLD_DEFAULTS.stepGoal);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    getThresholdSettings().then(s => setStepGoal(s.stepGoal));
  }, []);

  const bars = useMemo(() => {
    if (viewMode === 'week') {return buildWeekBars(pairCode);}
    if (viewMode === 'day')  {return buildDayBars(pairCode);}
    return buildMonthBars(pairCode);
  }, [pairCode, viewMode]);

  const stats = useMemo(() => calcStats(bars, viewMode), [bars, viewMode]);

  // 週/天視圖：等分欄寬；月視圖：固定 22px
  const BAR_GAP = viewMode === 'month' ? 3 : 4;
  const barWidth = useMemo(() => {
    if (viewMode === 'month') {return 22;}
    if (chartWidth === 0) {return 30;}
    return Math.max(10, (chartWidth - BAR_GAP * (bars.length - 1)) / bars.length);
  }, [viewMode, chartWidth, bars.length, BAR_GAP]);

  const TABS: {key: ViewMode; label: string}[] = [
    {key: 'day', label: '天'},
    {key: 'week', label: '週'},
    {key: 'month', label: '月'},
  ];

  return (
    <View style={s.card}>
      {/* 標題列 + 切換按鈕 */}
      <View style={s.header}>
        <Text style={s.title}>📊 步數趨勢</Text>
        <View style={s.tabRow}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setViewMode(tab.key)}
              style={[s.tab, viewMode === tab.key && s.tabActive]}>
              <Text style={[s.tabText, viewMode === tab.key && s.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 圖表主體 */}
      <View
        onLayout={e => setChartWidth(e.nativeEvent.layout.width)}
        style={{overflow: 'hidden'}}>
        {chartWidth > 0 && (
          viewMode === 'month' ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}>
              <BarColumns
                bars={bars}
                barWidth={barWidth}
                barGap={BAR_GAP}
                viewMode={viewMode}
                stepGoal={stepGoal}
              />
            </ScrollView>
          ) : (
            <BarColumns
              bars={bars}
              barWidth={barWidth}
              barGap={BAR_GAP}
              viewMode={viewMode}
              stepGoal={stepGoal}
            />
          )
        )}
      </View>

      {/* 統計摘要 */}
      <StatRow stats={stats} />

      {/* 圖例 (週/月視圖才顯示) */}
      {viewMode !== 'day' && (
        <View style={s.legend}>
          <LegendDot color={C.green} label={`達標 ≥${fmtNum(stepGoal)}步`} />
          <LegendDot color={C.orange} label="未達標" />
          <LegendDot color={C.indigo} label="今天" />
        </View>
      )}
    </View>
  );
}

function LegendDot({color, label}: {color: string; label: string}) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, {backgroundColor: color}]} />
      <Text style={s.legendText}>{label}</Text>
    </View>
  );
}

// ─── 樣式 ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: C.indigo,
    fontFamily: 'serif',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 4,
  },
  tab: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabActive: {
    backgroundColor: C.indigo,
    borderColor: C.indigo,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.sub,
  },
  tabTextActive: {
    color: C.cardBg,
  },
  valLabel: {
    fontSize: 8,
    color: '#555555',
  },
  xLabel: {
    fontSize: 9,
    color: C.sub,
    textAlign: 'center',
    lineHeight: 12,
  },
  xLabel2: {
    fontSize: 8,
    color: C.dim,
    textAlign: 'center',
    lineHeight: 11,
  },
  statsRow: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  statPrimary: {
    fontSize: 12,
    fontWeight: '700',
    color: C.indigo,
    marginBottom: 3,
  },
  statSubRow: {
    flexDirection: 'row',
  },
  statSub: {
    fontSize: 11,
    color: C.sub,
  },
  legend: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: C.sub,
  },
});
