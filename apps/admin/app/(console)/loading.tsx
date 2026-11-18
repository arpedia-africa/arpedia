export default function Loading() {
  return (
    <section className="screen" aria-busy="true" aria-label="Loading">
      <div className="band">
        <div className="skel" style={{ width: 220, height: 28 }} />
      </div>
      <div className="page">
        <div className="panel">
          <div className="panel__body" style={{ paddingTop: 18 }}>
            <div className="skel" style={{ width: '40%', height: 16 }} />
            <div className="skel" style={{ width: '100%', height: 14 }} />
            <div className="skel" style={{ width: '85%', height: 14 }} />
            <div className="skel" style={{ width: '70%', height: 14 }} />
          </div>
        </div>
      </div>
    </section>
  );
}
