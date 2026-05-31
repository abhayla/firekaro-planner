// Centralized Chart.js registration so charts work out of the box.
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  Title,
} from "chart.js";

let registered = false;

export function registerChartJSOnce() {
  if (registered) return;
  ChartJS.register(
    ArcElement,
    BarElement,
    CategoryScale,
    Filler,
    Legend,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip,
    Title,
  );
  registered = true;
}

// Chart colors aligned with FIREKaro theme
export const CHART_COLORS = {
  corpus: "#1867c0",
  lean: "#10b981",
  regular: "#f59e0b",
  fat: "#f97316",
  // Donut segments
  equity: "#1867c0",
  debt: "#10b981",
  realEstate: "#26a69a",
  gold: "#eab308",
  cash: "#94a3b8",
};
