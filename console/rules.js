// 앱과 콘솔이 같은 균등 배점 규칙을 사용합니다. 맞은 개수가 기준입니다.
export function normalizeTest(total, correct, score = null) {
  const n = Math.max(1, Math.min(100, Math.round(Number(total) || 20)));
  const hasCorrect = correct !== null && correct !== undefined && correct !== '';
  const hasScore = score !== null && score !== undefined && score !== '';
  if (!hasCorrect && !hasScore) return { total: n, correct: null, score: null };
  const c = hasCorrect ? Number(correct) : Math.round(Math.max(0, Math.min(100, Number(score) || 0)) * n / 100);
  const bounded = Math.max(0, Math.min(n, Math.round(Number.isFinite(c) ? c : 0)));
  return { total: n, correct: bounded, score: Math.round(bounded / n * 100) };
}

export const notificationChanged = (before, after) => before !== after && after !== null;

// 표시용 산식 검증 도구. 실제 화면의 총점은 서버가 반환한 항목을 사용합니다.
export const formatPoints = n => Number(n || 0).toLocaleString('ko-KR',{maximumFractionDigits:2});
export function studyDayScore(goal,minutesGoal,solved,minutes) {
 return Math.round((60*Math.max(0,Number(solved||0))/Math.max(1,Number(goal||1))+40*Math.max(0,Number(minutes||0))/Math.max(1,Number(minutesGoal||1)))*100)/100;
}
export function rankingTestBonus(score,prev) {
 return score==null?0:prev!=null&&(score>prev||(score>=90&&prev>=90))?5:0;
}
