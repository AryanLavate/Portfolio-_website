import { motion } from "framer-motion";
import "./CinematicPortfolioHero.css";

const navItems = ["Home", "About", "Projects", "Contact"];
const letters = "PORTFOLIO".split("");

export default function CinematicPortfolioHero({
  logoText = "A.",
  characterSrc = "/assets/Aryan01.png",
  characterAlt = "Portfolio character",
}) {
  return (
    <section className="cine">
      <div className="cine__bg" aria-hidden="true" />

      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="cine__glow"
      />

      <div className="cine__noise" aria-hidden="true" />

      <motion.nav
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="cine__nav"
      >
        <a href="#" className="cine__logo">
          {logoText}
        </a>

        <div className="cine__nav-links">
          {navItems.map((item) => (
            <a key={item} href={`#${item.toLowerCase()}`} className="cine__nav-link">
              <span>{item}</span>
            </a>
          ))}
        </div>
      </motion.nav>

      <div className="cine__rail" aria-hidden="true">
        CREATIVE PORTFOLIO
      </div>

      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 1, ease: "easeOut" }}
        className="cine__mega-wrap"
      >
        <div className="cine__mega">
          <span className="cine__mega-blur" aria-hidden="true">
            PORTFOLIO
          </span>
          {letters.map((letter, index) => (
            <motion.span
              key={`${letter}-${index}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + index * 0.04, duration: 0.55 }}
            >
              {letter}
            </motion.span>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 35, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.45, duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="cine__portrait-wrap"
      >
        <div className="cine__portrait-inner">
          <img src={characterSrc} alt={characterAlt} loading="eager" />
        </div>
      </motion.div>
    </section>
  );
}
