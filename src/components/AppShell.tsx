import {
  Activity,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  FlaskConical,
  Home,
  Menu,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { LOCAL_ONLY_BUILD } from "@/utils/deployment";
import styles from "./AppShell.module.css";

export default function AppShell() {
  const location = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLElement>(null);
  const presenting = location.pathname.startsWith("/presentation/");
  const working = /^\/(demo|session|aar|instructor)(\/|$)/.test(
    location.pathname,
  );
  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === path
      : location.pathname === path || location.pathname.startsWith(`${path}/`);
  const navigation = [
    { to: "/", label: "Home", icon: Home, active: isActive("/") },
    {
      to: "/scenarios",
      label: "Scenario library",
      icon: BookOpen,
      active: isActive("/scenarios") || isActive("/scenario"),
    },
    {
      to: "/demo",
      label: "Flagship demo",
      icon: Activity,
      active: isActive("/demo"),
    },
    ...(!LOCAL_ONLY_BUILD
      ? [
          {
            to: "/join",
            label: "Join session",
            icon: Users,
            active: isActive("/join") || isActive("/lobby"),
          },
        ]
      : []),
    {
      to: "/history",
      label: "History",
      icon: ChartNoAxesColumnIncreasing,
      active: isActive("/history") || isActive("/analytics"),
    },
  ];
  useEffect(() => {
    setNavigationOpen(false);
  }, [location.pathname]);
  return (
    <div
      className={`${styles.shell} ${presenting ? styles.presenting : ""} ${working ? styles.working : ""}`}
    >
      <a
        className={styles.skipLink}
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          content.current?.focus();
        }}
      >
        Skip to content
      </a>
      {!presenting && (
        <header
          className={styles.header}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !navigationOpen) return;
            event.preventDefault();
            setNavigationOpen(false);
            menuButton.current?.focus();
          }}
        >
          <Link className={styles.brand} to="/" aria-label="DHUNDH home">
            <span className={styles.mark} aria-hidden="true">
              D
            </span>
            <span>DHUNDH</span>
          </Link>
          <nav
            id="primary-navigation"
            className={styles.nav}
            data-open={navigationOpen}
            aria-label="Primary navigation"
          >
            {navigation.map(({ to, label, icon: Icon, active }) => (
              <Link
                key={to}
                className={active ? styles.active : ""}
                to={to}
                aria-current={active ? "page" : undefined}
                onClick={() => setNavigationOpen(false)}
              >
                <Icon size={15} aria-hidden="true" /> {label}
              </Link>
            ))}
          </nav>
          <div className={styles.synthetic}>
            <FlaskConical size={14} aria-hidden="true" />
            <span>Synthetic training environment</span>
          </div>
          <button
            ref={menuButton}
            type="button"
            className={styles.menuButton}
            aria-expanded={navigationOpen}
            aria-controls="primary-navigation"
            onClick={() => setNavigationOpen((open) => !open)}
          >
            {navigationOpen ? (
              <X size={18} aria-hidden="true" />
            ) : (
              <Menu size={18} aria-hidden="true" />
            )}
            Menu
          </button>
        </header>
      )}
      <main
        id="main-content"
        ref={content}
        tabIndex={-1}
        className={styles.content}
      >
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
