import { createBrowserRouter } from "react-router-dom";
import HomePage from "@/features/home/HomePage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
    errorElement: (
      <main>
        <h1>DHUNDH could not load this page.</h1>
        <p>Only the engineering foundation is available at Gate 0.</p>
        <a href="/">Return to the foundation</a>
      </main>
    ),
  },
]);
