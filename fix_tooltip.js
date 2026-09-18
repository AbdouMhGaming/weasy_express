const fs = require('fs');

let content = fs.readFileSync('artifacts/weasy-express/src/pages/admin/EcotrackDashboardView.tsx', 'utf8');

const oldMemo = `  const hoveredWilayaData = useMemo(() => {
    if (!hoveredWilaya) return null;
    return byWilaya.find((w: any) => String(w.wilayaId) === hoveredWilaya);
  }, [hoveredWilaya, byWilaya]);`;

const newMemo = `  const hoveredWilayaData = useMemo(() => {
    if (!hoveredWilaya) return null;
    const data = byWilaya.find((w: any) => String(w.wilayaId) === hoveredWilaya);
    if (data) return data;
    return {
      wilayaId: hoveredWilaya,
      total: 0,
      delivered: 0,
      returned: 0,
      amount: 0,
      successRate: 0,
    };
  }, [hoveredWilaya, byWilaya]);`;

content = content.replace(oldMemo, newMemo);
fs.writeFileSync('artifacts/weasy-express/src/pages/admin/EcotrackDashboardView.tsx', content);
