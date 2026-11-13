import ScreeningSelection from "../features/screenings/components/ScreeningSelection.jsx";

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header shell">
        <a className="wordmark" href="#main" aria-label="RIO cinema home">
          RIO<span>cinema</span>
        </a>
        <a className="header-link" href="#cinemas">
          Find a screening <span aria-hidden="true">↗</span>
        </a>
      </header>
      <main id="main" className="shell">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">Good films. Great company.</p>
            <h1 id="hero-title">
              Make room for
              <br />a great story.
            </h1>
            <p className="intro">
              Big-screen moments, a little closer to home.
              <br />
              Find your local RIO cinema.
            </p>
            <a className="primary-link" href="#cinemas">
              Find a screening <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="cinema-art" aria-hidden="true">
            <div className="art-frame">
              <span className="art-star">✳</span>
              <span className="art-caption">
                See you
                <br />
                at RIO.
              </span>
            </div>
            <span className="art-note">Lights down. Stories on.</span>
          </div>
        </section>
        <ScreeningSelection />
      </main>
      <footer className="site-footer shell">
        <span className="footer-brand">RIO</span>
        <p>Cinema in Finland. Stories for everyone.</p>
      </footer>
    </>
  );
}
