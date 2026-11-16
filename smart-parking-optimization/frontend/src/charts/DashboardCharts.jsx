import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const BASE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        boxWidth: 12,
        padding: 14,
        color: '#334155',
        font: { size: 12 },
      },
    },
  },
}

export function UtilizationDoughnutChart({ data }) {
  const chartData = {
    labels: ['Available', 'Occupied', 'Unavailable'],
    datasets: [
      {
        data: [data?.available || 0, data?.occupied || 0, data?.unavailable || 0],
        backgroundColor: ['#10b981', '#e11d48', '#94a3b8'],
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  }

  return (
    <div className="h-64">
      <Doughnut
        data={chartData}
        options={{
          ...BASE_OPTIONS,
          cutout: '65%',
        }}
      />
    </div>
  )
}

export function VehicleDistributionChart({ items = [] }) {
  const chartData = {
    labels: items.map((d) => d.vehicle_type),
    datasets: [
      {
        label: 'Registered Vehicles',
        data: items.map((d) => d.count),
        backgroundColor: ['#0f172a', '#2563eb', '#0284c7'],
        borderRadius: 6,
        maxBarThickness: 48,
      },
    ],
  }

  return (
    <div className="h-64">
      <Bar
        data={chartData}
        options={{
          ...BASE_OPTIONS,
          scales: {
            y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
            x: { grid: { display: false } },
          },
        }}
      />
    </div>
  )
}

export function ZoneOccupancyChart({ zones = [] }) {
  const chartData = {
    labels: zones.map((z) => z.zone),
    datasets: [
      {
        label: 'Occupied',
        data: zones.map((z) => z.occupied),
        backgroundColor: '#e11d48',
        borderRadius: 4,
      },
      {
        label: 'Available',
        data: zones.map((z) => z.available),
        backgroundColor: '#10b981',
        borderRadius: 4,
      },
      {
        label: 'Unavailable',
        data: zones.map((z) => z.unavailable),
        backgroundColor: '#94a3b8',
        borderRadius: 4,
      },
    ],
  }

  return (
    <div className="h-64">
      <Bar
        data={chartData}
        options={{
          ...BASE_OPTIONS,
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' } },
          },
        }}
      />
    </div>
  )
}

export function HourlyDemandChart({ periods = [] }) {
  const chartData = {
    labels: periods.map((p) => p.time_period),
    datasets: [
      {
        label: 'Total Demand (Vehicles)',
        data: periods.map((p) => p.total_demand),
        borderColor: '#1d4ed8',
        backgroundColor: 'rgba(29, 78, 216, 0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
      },
    ],
  }

  return (
    <div className="h-64">
      <Line
        data={chartData}
        options={{
          ...BASE_OPTIONS,
          scales: {
            y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
            x: { grid: { display: false } },
          },
        }}
      />
    </div>
  )
}

export function CostComparisonChart({ items = [] }) {
  const chartData = {
    labels: items.map((c) => c.label),
    datasets: [
      {
        label: 'Hungarian Optimal Cost',
        data: items.map((c) => c.hungarian_cost),
        backgroundColor: '#0f172a',
        borderRadius: 6,
      },
      {
        label: 'Random Feasible Baseline',
        data: items.map((c) => c.baseline_cost),
        backgroundColor: '#94a3b8',
        borderRadius: 6,
      },
    ],
  }

  return (
    <div className="h-64">
      <Bar
        data={chartData}
        options={{
          ...BASE_OPTIONS,
          scales: {
            y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
            x: { grid: { display: false } },
          },
        }}
      />
    </div>
  )
}

export function DemandTrendChart({ trends = [] }) {
  const chartData = {
    labels: trends.map((t) => t.date),
    datasets: [
      {
        label: 'Daily Parking Demand',
        data: trends.map((t) => t.total_demand),
        borderColor: '#0f172a',
        backgroundColor: 'rgba(15, 23, 42, 0.08)',
        fill: true,
        tension: 0.25,
      },
      {
        label: 'Avg Available Slots',
        data: trends.map((t) => t.avg_available_slots),
        borderColor: '#10b981',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        tension: 0.25,
      },
    ],
  }

  return (
    <div className="h-72">
      <Line
        data={chartData}
        options={{
          ...BASE_OPTIONS,
          scales: {
            y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
            x: { grid: { display: false } },
          },
        }}
      />
    </div>
  )
}

export function UserCostChart({ items = [] }) {
  const chartData = {
    labels: items.map((i) => i.user_type),
    datasets: [
      {
        label: 'Average Allocation Cost',
        data: items.map((i) => i.avg_cost),
        backgroundColor: ['#0f172a', '#1d4ed8', '#0284c7', '#64748b'],
        borderRadius: 6,
        maxBarThickness: 52,
      },
    ],
  }

  return (
    <div className="h-64">
      <Bar
        data={chartData}
        options={{
          ...BASE_OPTIONS,
          scales: {
            y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
            x: { grid: { display: false } },
          },
        }}
      />
    </div>
  )
}

