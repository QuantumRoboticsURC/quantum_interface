import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Home from "./routes/homeScreen";
import Arm from "./routes/arm";
import Control from "./routes/control"; 
import Strat from "./routes/stratigraphic";
import Laboratory from "./routes/laboratory";
import Autonomous from "./routes/autonomous";
import Cameras from "./routes/cameras";

import "./main.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />, // Layout común
    children: [
      { index: true, element: <Home /> },
      { path: "arm", element: <Arm /> },
      { path: "control", element: <Control /> },
      { path: "stratigraphic-profile", element: <Strat /> },
      { path: "laboratory", element: <Laboratory /> },
      { path: "autonomous-navigation", element: <Autonomous /> },
      { path: "cameras", element: <Cameras /> },
     
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
