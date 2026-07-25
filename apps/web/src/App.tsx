import './App.css'

function App() {
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">ETHGlobal Lisbon 2026 / clean-room build</p>
        <h1>
          Liquid <span>OB</span>
        </h1>
        <p className="lede">
          A functional order book for bounded, executable maker curves.
        </p>
      </header>

      <section className="status-grid" aria-label="Repository status">
        <article>
          <span className="index">01</span>
          <h2>Contracts</h2>
          <p>Foundry configured. No protocol code yet.</p>
        </article>
        <article>
          <span className="index">02</span>
          <h2>Interface</h2>
          <p>TypeScript pipeline verified. Product work starts next.</p>
        </article>
        <article>
          <span className="index">03</span>
          <h2>History</h2>
          <p>Every implementation step will remain visible in Git.</p>
        </article>
      </section>

      <footer>
        <span>Bootstrap baseline</span>
        <time dateTime="2026-07-25">25 July 2026</time>
      </footer>
    </main>
  )
}

export default App
