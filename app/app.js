const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;

function findTimeOffsetChange(startDate, endDate) {
  if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
    throw new Error("Both arguments must be Date objects");
  }
  if (endDate < startDate) {
    throw new Error("End date must be after start date");
  }
  if (!areInDifferentDSTStates(startDate, endDate)) {
    return null;
  }

  let left = new Date(startDate);
  let right = new Date(endDate);

  while (right.getTime() - left.getTime() > HOUR_IN_MS) {
    const mid = new Date((left.getTime() + right.getTime()) / 2);
    if (!areInDifferentDSTStates(startDate, mid)) {
      left = mid;
    } else {
      right = mid;
    }
  }

  const day = new Date(left);
  day.setHours(0, 0, 0, 0);
  let prevOffset = day.getTimezoneOffset();

  for (let minute = -60; minute <= 1440; minute++) {
    const checkTime = new Date(day);
    checkTime.setMinutes(minute, 0, 0);
    const currentOffset = checkTime.getTimezoneOffset();

    if (currentOffset !== prevOffset) {
      const changeTime = new Date(checkTime);
      // Force the timezone offset to be the previous (pre-change) offset.
      changeTime.setMinutes(
        changeTime.getMinutes() + (currentOffset - prevOffset)
      );
      return {
        date: changeTime,
        offsetChange: prevOffset - currentOffset,
      };
    }
    prevOffset = currentOffset;
  }
  return null;
}

function areInDifferentDSTStates(date1, date2) {
  return date1.getTimezoneOffset() !== date2.getTimezoneOffset();
}

function isDst(date) {
  const sixMonthsAgo = new Date(date);
  sixMonthsAgo.setMonth(date.getMonth() - 6);
  const lastChange = findTimeOffsetChange(sixMonthsAgo, date);
  if (!lastChange) {
    return false; // No DST in this timezone
  }
  // If we're after the change:
  // - If it was spring forward (+X), we're in DST.
  // - If it was fall back (-X), we're in Standard Time.
  return lastChange.offsetChange > 0;
}

function formatTimeRemaining(msRemaining) {
  const days = Math.floor(msRemaining / DAY_IN_MS);
  const hours = Math.floor((msRemaining % DAY_IN_MS) / (1000 * 60 * 60));
  const parts = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
  return parts.length ? `${parts.join(" and ")}` : "Less than an hour";
}

function renderClockChange(change) {
  if (!change) {
    return `<div class="no-dst">
      <h1>No Clock Changes</h1>
      <p>Your region does not observe time changes.</p>
    </div>`;
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTonight =
    change.date.getDate() === tomorrow.getDate() &&
    change.date.getMonth() === tomorrow.getMonth() &&
    change.date.getFullYear() === tomorrow.getFullYear();
  change.date.getMonth() === now.getMonth();

  const dateStr = change.date.toLocaleDateString(navigator.language, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year:
      change.date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });

  const twoWeeksInMs = 14 * 24 * 60 * 60 * 1000;
  const showNemui = change.date - now < twoWeeksInMs;

  return `
    <div class="clock-change">
      <div class="calendar-container">
        <div class="calendar">
          <div class="calendar-month">
            ${change.date.toLocaleString(navigator.language, {
              month: "long",
            })}
          </div>
          <div class="calendar-day">${change.date.getDate()}</div>
        </div>
        ${(() => {
          const times = formatTimeChange(change.offsetChange, change.date);
          return `<div class="time-change">
            <span class="from">${times.from}</span>
            <span class="arrow">→</span>
            <span class="to">${times.to}</span>
          </div>`;
        })()}
      </div>
      <div class="info">
        <h1>Next Clock Change</h1>
        <div class="status">
          ${isDst(now) ? "Currently in DST" : "Currently in Standard Time"}
        </div>
        <p class="description">
          While you sleep through ${dateStr}, you'll
          <span class="${
            change.offsetChange > 0 ? "time-loss" : "time-gain"
          }">${
    change.offsetChange > 0 ? "lose" : "gain"
  }</span> an hour of sleep.
          ${isTonight ? '<span class="tonight">That\'s tonight!</span>' : ""}
        </p>
        ${
          showNemui
            ? `<p class="sleep-advice">
          Want to avoid the abrupt change? Try
          <a href="https://nemui.osc.garden" class="advice-link">nemui</a> with matching "current" and "desired" schedules.
        </p>`
            : `<p class="countdown">
          Change happening in ${formatTimeRemaining(change.date - now)}.
        </p>`
        }
      </div>
    </div>
  `;
}

function getNextChange() {
  const now = new Date();
  const sixMonthsLater = new Date(now);
  sixMonthsLater.setMonth(now.getMonth() + 6, now.getDate());
  return findTimeOffsetChange(now, sixMonthsLater);
}

function updateDisplay() {
  const change = getNextChange();
  document.getElementById("content").innerHTML = renderClockChange(change);
}

function formatTimeChange(offsetChange, changeDate) {
  const MINUTES_PER_HOUR = 60;
  const offsetMs =
    offsetChange < 0 ? Math.abs(offsetChange) * (MINUTES_PER_HOUR * 1000) : 0;
  const beforeChange = new Date(
    changeDate.getTime() - offsetMs - MINUTES_PER_HOUR * 1000
  );
  const afterChange = new Date(changeDate);
  const formatTime = (hours, minutes) =>
    `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  const lastTime = formatTime(
    beforeChange.getHours(),
    beforeChange.getMinutes()
  );
  let firstTime;
  if (offsetChange < 0) {
    // When falling back, use same hour with calculated minutes for partial-hour transitions.
    firstTime = formatTime(
      beforeChange.getHours(),
      Math.abs(offsetChange) % MINUTES_PER_HOUR
    );
  } else {
    // When springing forward, include any partial-hour offset in final time.
    firstTime = formatTime(
      afterChange.getHours(),
      offsetChange % MINUTES_PER_HOUR
    );
  }
  return {
    from: lastTime,
    to: firstTime,
  };
}

updateDisplay();
document.getElementById("userTimezone").textContent = Intl.DateTimeFormat()
  .resolvedOptions()
  .timeZone;
