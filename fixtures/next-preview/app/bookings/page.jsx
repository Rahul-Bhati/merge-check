import fs from "fs";
import { sample } from "../../lib/bookings";

export const dynamic = "force-dynamic";

function runtimeFlags() {
  const file = process.env["MERGE_CHECK_FLAGS"];
  if (!file) return { hideHeading: false, leak: "" };
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { hideHeading: false, leak: "" };
  }
}

export default async function BookingsPage({ searchParams }) {
  const sp = await searchParams;
  const flags = runtimeFlags();
  const heading = flags.hideHeading ? "Schedule" : "Bookings";
  if (sp.error) {
    return (
      <main>
        <h1>{heading}</h1>
        <p>Could not load bookings</p>
      </main>
    );
  }
  const items = sp.empty ? [] : sample;
  return (
    <main>
      <h1>{heading}</h1>
      <button type="button">Refresh</button>
      {flags.leak ? <p>{flags.leak}</p> : null}
      {items.length === 0 ? <p>No bookings yet</p> : <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>}
    </main>
  );
}
