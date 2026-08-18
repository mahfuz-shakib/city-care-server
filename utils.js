export const issuesMatrics = (issues) => {
  const today = new Date().toISOString();
  const cur = today.split("-").slice(0, 2);
  const currentMonth = cur.join("-");
  const prev = Number(cur[1]) - 1 == 0 ? 12 : Number(cur[1]) - 1;
  const preMonth = prev < 10 ? "0" + prev.toString() : prev.toString();
  const year = Number(cur[1]) - 1 == 0 ? Number(cur[0]) - 1 : cur[0];
  const previousMonth = year + "-" + preMonth;
  if (issues) {
    const resolvedIssues = issues.filter((i) => i.status === "resolved");
    const pendingIssues = issues.filter((i) => i.status === "pending");
    const pmi = resolvedIssues?.filter((i) => i.resolvedAt.toISOString().includes(previousMonth));
    const cmi = resolvedIssues?.filter((i) => i.resolvedAt.toISOString().includes(currentMonth));
    const prevRes = pmi?.reduce((acc, curr) => {
      const diff = (new Date(curr.resolvedAt) - new Date(curr.createdAt)) / (1000 * 60 * 60 * 24);
      console.log("reduce ", diff, acc + diff);
      return acc + diff;
    }, 0);
    const currRes = cmi?.reduce((acc, curr) => {
      const diff = (new Date(curr.resolvedAt) - new Date(curr.createdAt)) / (1000 * 60 * 60 * 24);
      return acc + diff;
    }, 0);
    return {
      allSize: issues.length,
      resolvedSize: resolvedIssues.length,
      pendingSize: pendingIssues.length,
      prevMonthSize: pmi.length,
      currMonthSize: cmi.length,
      prevMonthReso: prevRes,
      currMonthReso: currRes,
    };
  }
};


