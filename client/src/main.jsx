import React from "react";
import ReactDOM from "react-dom/client";
import ContactVerification from "./ContactVerification.jsx";
import "./index.css";

const el = document.getElementById("contact-verify-root");
if (el) {
  const root = ReactDOM.createRoot(el);
  root.render(
    <React.StrictMode>
      <ContactVerification />
    </React.StrictMode>
  );
}
