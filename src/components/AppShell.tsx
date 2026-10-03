import {
  Activity,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  Home,
  Users,
} from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { LOCAL_ONLY_BUILD } from "@/utils/deployment";
import styles from "./AppShell.module.css";

export default function AppShell() {
  const location = useLocation();
  const presenting = location.pathname.startsWith("/presentation/");
  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === path
      : location.pathname === path || location.pathname.startsWith(`${path}/`);
  return (
    <div className={`${styles.shell} ${presenting ? styles.presenting : ""}`}>
      {!presenting && (
        <header className={styles.header}>
          <Link className={styles.brand} to="/" aria-label="DHUNDH home">
            <span className={styles.mark} aria-hidden="true">
              D
            </span>
            <span>DHUNDH</span>
          </Link>
          <nav className={styles.nav} aria-label="Primary navigation">
            <Link className={isActive("/") ? styles.active : ""} to="/">
              <Home size={15} aria-hidden="true" /> Home
            </Link>
            <Link
              className={isActive("/scenarios") ? styles.active : ""}
              to="/scenarios"
            >
              <BookOpen size={15} aria-hidden="true" /> Scenario library
            </Link>
            <Link className={isActive("/demo") ? styles.active : ""} to="/demo">
              <Activity size={15} aria-hidden="true" /> Flagship demo
            </Link>
            {!LOCAL_ONLY_BUILD && (
              <Link
                className={isActive("/join") ? styles.active : ""}
                to="/join"
              >
                <Users size={15} aria-hidden="true" /> Join session
              </Link>
            )}
            <Link
              className={isActive("/history") ? styles.active : ""}
              to="/history"
            >
              <ChartNoAxesColumnIncreasing size={15} aria-hidden="true" />{" "}
              History
            </Link>
          </nav>
          <div className={styles.synthetic}>
            <span className={styles.dot} />
            Synthetic training environment
          </div>
        </header>
      )}
      <main className={styles.content}>
        <Outlet />
      </main>
      {!presenting && (
        <footer className={styles.footer}>
          Fictional, non-operational training. Scenario content, entities,
          reliabilities, and payoffs are synthetic authoring assumptions.
        </footer>
      )}
    </div>
  );
}
