// export const issuesMatrics = (issues) => {
//   const today = new Date().toISOString();
//   const cur = today.split("-").slice(0, 2);
//   const currentMonth = cur.join("-");
//   const prev = Number(cur[1]) - 1 == 0 ? 12 : Number(cur[1]) - 1;
//   const preMonth = prev < 10 ? "0" + prev.toString() : prev.toString();
//   const year = Number(cur[1]) - 1 == 0 ? Number(cur[0]) - 1 : cur[0];
//   const previousMonth = year + "-" + preMonth;
//   if (issues) {
//     const resolvedIssues = issues.filter((i) => i.status === "resolved");
//     const pendingIssues = issues.filter((i) => i.status === "pending");
//     const pmi = resolvedIssues?.filter((i) => i.resolvedAt.toISOString().includes(previousMonth));
//     const cmi = resolvedIssues?.filter((i) => i.resolvedAt.toISOString().includes(currentMonth));
//     const prevRes = pmi?.reduce((acc, curr) => {
//       const diff = (new Date(curr.resolvedAt) - new Date(curr.createdAt)) / (1000 * 60 * 60 * 24);
//       console.log("reduce ", diff, acc + diff);
//       return acc + diff;
//     }, 0);
//     const currRes = cmi?.reduce((acc, curr) => {
//       const diff = (new Date(curr.resolvedAt) - new Date(curr.createdAt)) / (1000 * 60 * 60 * 24);
//       return acc + diff;
//     }, 0);
//     return {
//       allSize: issues.length,
//       resolvedSize: resolvedIssues.length,
//       pendingSize: pendingIssues.length,
//       prevMonthSize: pmi.length,
//       currMonthSize: cmi.length,
//       prevMonthReso: prevRes,
//       currMonthReso: currRes,
//     };
//   }
// };

// utils.js

export const issuesMetrics = (issues) => {
  if (!issues || !Array.isArray(issues)) {
    return null;
  }

  const resolvedIssues = issues.filter((issue) => issue.status === "resolved");
  const pendingIssues = issues.filter((issue) => issue.status === "pending");

  // Generate last 6 months
  // Current month included

  const today = new Date();
  const months = [];

  for (let i = 5; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");

    months.push({
      key: `${year}-${month}`,
      date,
    });
  }

  // ---------------------------------------------
  // Calculate resolution performance
  // for each of the last 6 months
  // ---------------------------------------------

  const resolutionPerformance = months.map(({ key, date }) => {
    // Issues that were resolved in this month
    const monthIssues = resolvedIssues.filter((issue) => {
      if (!issue.resolvedAt) return false;

      return issue.resolvedAt.toISOString().startsWith(key);
    });

    // Total resolution time
    const totalResolutionDays = monthIssues.reduce((total, issue) => {
      if (!issue.createdAt || !issue.resolvedAt) {
        return total;
      }

      const resolutionDays = (new Date(issue.resolvedAt) - new Date(issue.createdAt)) / (1000 * 60 * 60 * 24);

      return total + resolutionDays;
    }, 0);

    // Average resolution time
    const averageResolution = monthIssues.length > 0 ? totalResolutionDays / monthIssues.length : null;

    return {
      month: date.toLocaleString("en-US", {
        month: "short",
      }),
      monthKey: key,
      resolvedCount: monthIssues.length,
      averageResolution: averageResolution !== null ? Number(averageResolution.toFixed(1)) : null,
    };
  });

  // Calculate month-over-month resolution change
  const performanceWithChange = resolutionPerformance.map((item, index) => {
    // First month has no previous month
    if (index === 0) {
      return {
        ...item,
        resolutionChangePercent: null,
      };
    }

    const previous = resolutionPerformance[index - 1].averageResolution;
    const current = item.averageResolution;

    // Can't calculate without both values
    if (previous === null || current === null || previous === 0) {
      return {
        ...item,
        resolutionChangePercent: null,
      };
    }

    const change = ((previous - current) / previous) * 100;

    return {
      ...item,
      resolutionChangePercent: Number(change.toFixed(1)),
    };
  });

  return {
    // Overall statistics
    allSize: issues.length,
    resolvedSize: resolvedIssues.length,
    pendingSize: pendingIssues.length,
    // Last 6 months resolution data
    resolutionPerformance: performanceWithChange,
  };
};
