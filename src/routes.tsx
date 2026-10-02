import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { createBrowserRouter, Link } from "react-router-dom";
import AppShell from "@/components/AppShell";

const AarPage = lazy(() => import("@/features/aar/AarPage"));
const BriefingPage = lazy(() => import("@/features/briefing/BriefingPage"));
const DemoPage = lazy(() => import("@/features/demo/DemoPage"));
const HomePage = lazy(() => import("@/features/home/HomePage"));
const ScenarioLibraryPage = lazy(
  () => import("@/features/library/ScenarioLibraryPage"),
);
const SessionPage = lazy(() => import("@/features/session/SessionPage"));

function RouteLoading() {
  return <p role="status">Loading training interface…</p>;
}

function load(element: ReactNode) {
  return <Suspense fallback={<RouteLoading />}>{element}</Suspense>;
}

function RouteError() {
  return (
    <section>
      <h1>DHUNDH could not load this page.</h1>
      <p>The local exercise may have ended or the address may be invalid.</p>
      <Link to="/">Return home</Link>
    </section>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: load(<HomePage />) },
      { path: "scenarios", element: load(<ScenarioLibraryPage />) },
      { path: "scenario/:id/briefing", element: load(<BriefingPage />) },
      { path: "session/local/:id", element: load(<SessionPage />) },
      { path: "demo", element: load(<DemoPage />) },
      { path: "aar/:id", element: load(<AarPage />) },
      { path: "*", element: <RouteError /> },
    ],
  },
]);
