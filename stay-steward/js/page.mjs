// Stay Steward's own page controls: the trip form (private context) and the gate log.
import { STAYS, Trip } from "./trip.mjs";

function render(line) {
  const list = document.getElementById("gate-log");
  const empty = document.getElementById("gate-empty");
  if (empty) {
    empty.hidden = true;
  }
  const item = document.createElement("li");
  item.className = `log-${line.kind}${line.stop ? ` log-stop-${line.stop}` : ""}${line.verdict ? ` log-${line.verdict.toLowerCase()}` : ""}`;
  item.dataset.kind = line.kind;
  if (line.stop) {
    item.dataset.stop = line.stop;
  }
  const time = document.createElement("time");
  time.textContent = line.at.slice(11, 19);
  const text = document.createElement("span");
  text.textContent = line.text;
  item.append(time, text);
  list.append(item);
}

function mount() {
  const page = Trip.page;
  const select = document.getElementById("trip-stay");
  for (const stay of STAYS) {
    select.append(new Option(stay.label, stay.link));
  }
  document.getElementById("trip-in").value = page.trip.checkIn;
  document.getElementById("trip-out").value = page.trip.checkOut;
  document.getElementById("trip-name").value = page.trip.guestName;
  select.value = page.trip.stay;
  const out = document.getElementById("trip-out-status");
  const show = () => {
    const t = page.getTrip();
    out.textContent = `${t.stay}, ${t.nights} night(s). Partners receive only target_url = ${t.stayUrl} (FactGate, to check it, and ${t.stay} itself).`;
  };
  document.getElementById("trip-form").addEventListener("input", () => {
    const r = page.update({
      checkIn: document.getElementById("trip-in").value,
      checkOut: document.getElementById("trip-out").value,
      guestName: document.getElementById("trip-name").value,
      stay: select.value,
    });
    if (r.ok === false) {
      out.textContent = r.reason;
      return;
    }
    show();
  });
  show();
  page.listeners.push(render);
  for (const line of page.log) {
    render(line);
  }
}

if (typeof document !== "undefined") {
  mount();
}
