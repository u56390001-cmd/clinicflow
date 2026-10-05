export default function TestDisplayPage() {
  return (
    <div style={{ padding: "2rem", background: "#000", color: "#fff", minHeight: "100vh" }}>
      <h1>Display Route Test</h1>
      <p>If you see this, the route is working!</p>
      <p>Current time: {new Date().toISOString()}</p>
    </div>
  );
}
