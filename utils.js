export const issuesMetrics = (issues) => {
  if (!issues || !Array.isArray(issues)) {
    return null;
  }
  const resolvedIssues = issues.filter((issue) => issue.status === "resolved");
  const pendingIssues = issues.filter((issue) => issue.status === "pending");
  const resolutionTimes = resolvedIssues
    .filter((issue) => issue.createdAt && issue.resolvedAt)
    .map((issue) => (new Date(issue.resolvedAt) - new Date(issue.createdAt)) / (1000 * 60 * 60 * 24));
  const overallAverageResolution = resolutionTimes.length
    ? Number((resolutionTimes.reduce((total, days) => total + days, 0) / resolutionTimes.length).toFixed(1))
    : null;

  // Generate last 6 months & Current month included
  const today = new Date();
  const months = [];

  for (let i = 5; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    console.log(date);
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
    const reportedCount = issues.filter((issue) => {
      if (!issue.createdAt) return false;

      return issue.createdAt.toISOString().startsWith(key);
    }).length;
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
      reportedCount,
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
  const categoryAliases = {
    road: "transport",
    water: "infrastructure",
    electricity: "infrastructure",
    garbage: "sanitation",
    waste: "sanitation",
    safety: "public safety",
  };
  const categoryNames = ["infrastructure", "public safety", "environment", "sanitation", "transport", "construction"];
  const categoryCounts = Object.fromEntries(
    categoryNames.map((category) => [category, { reportedCount: 0, resolvedCount: 0, pendingCount: 0 }]),
  );

  issues.forEach((issue) => {
    const rawCategory = String(issue.category || "").toLowerCase();
    const category = categoryAliases[rawCategory] || rawCategory;
    if (!categoryCounts[category]) return;

    categoryCounts[category].reportedCount += 1;
    if (issue.status === "resolved" || issue.status === "closed") categoryCounts[category].resolvedCount += 1;
    if (issue.status === "pending") categoryCounts[category].pendingCount += 1;
  });

  const categoryStatistics = categoryNames.map((category) => {
    const counts = categoryCounts[category];
    return {
      category,
      ...counts,
      resolutionRate: counts.reportedCount
        ? Number(((counts.resolvedCount / counts.reportedCount) * 100).toFixed(1))
        : 0,
    };
  });

  return {
    // Overall statistics
    allSize: issues.length,
    resolvedSize: resolvedIssues.length,
    pendingSize: pendingIssues.length,
    overallAverageResolution,
    resolutionRate: issues.length ? Number(((resolvedIssues.length / issues.length) * 100).toFixed(1)) : 0,
    categoryStatistics,
    // Last 6 months resolution data
    resolutionPerformance: performanceWithChange,
  };
};
