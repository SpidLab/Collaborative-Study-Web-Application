import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AppBar, Toolbar, Typography, Button } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { Home, Upload, Search, Session, Login } from "./components";
import BrightnessHighIcon from '@mui/icons-material/BrightnessHigh';
import LoggedIn from './components/Navigation/LoggedIn';
import LoggedOut from './components/Navigation/LoggedOut';
import CollaborationsPage from './components/Collabrations/CollabrationsPage';
import CollaborationDetailsPage from './components/Collabrations/Details';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if user is already logged in based on localStorage
    const userLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    setIsLoggedIn(userLoggedIn);
  }, []);

  const handleLogin = () => {
    // Simulate login and set isLoggedIn to true
    setIsLoggedIn(true);
    // Set isLoggedIn to true in localStorage
    localStorage.setItem('isLoggedIn', 'true');
  };

  const handleLogout = () => {
    // Simulate logout and set isLoggedIn to false
    setIsLoggedIn(false);
    // Set isLoggedIn to false in localStorage
    localStorage.setItem('isLoggedIn', 'false');
  };

  return (
    <Router>
      <AppBar position="static">
        <Toolbar>
          <BrightnessHighIcon sx={{ display: { xs: 'none', md: 'flex' }, mr: 1 }} />
          <Typography variant="h6" style={{ flexGrow: 1 }}>
            Collaborative Web Application
          </Typography>
          {isLoggedIn ? (
            <LoggedIn onLogout={handleLogout} />
          ) : (
            <LoggedOut onLogin={handleLogin} />
          )}
        </Toolbar>
      </AppBar>

      <Routes>
        <Route path="/" element={<Home />} />
        {!isLoggedIn && <Route path="/login" element={<Login onLogin={handleLogin} />} />}
        {isLoggedIn && (
          <>
            <Route path="/upload" element={<Upload />} />
            <Route path="/search" element={<Search />} />
            <Route path="/session" element={<Session />} />
            <Route path="/collaboration" element={<CollaborationsPage />} />
            <Route path="/collaboration/:id" element={<CollaborationDetailsPage />} />
          </>
        )}
      </Routes>
    </Router>
  );
}

export default App;
