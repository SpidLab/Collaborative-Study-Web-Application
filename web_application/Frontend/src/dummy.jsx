import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AppBar, Toolbar, Typography } from "@mui/material";
import { Home, Upload, Search, Session, Login, NewUser } from "./components";
import BrightnessHighIcon from '@mui/icons-material/BrightnessHigh';
import LoggedIn from './components/Navigation/LoggedIn';
import LoggedOut from './components/Navigation/LoggedOut';
import ForgotUsername from './components/Forgot/ForgotUsername'; 
import ForgotPassword from './components/Forgot/ForgotPassword'; 
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
        <Route path="/register" element={<NewUser />} />
        {!isLoggedIn ? (
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
        ) : (
          <>
            <Route path="/upload" element={<Upload />} />
            <Route path="/search" element={<Search />} />
            <Route path="/session" element={<Session />} />
            <Route path="/collaboration" element={<CollaborationsPage />} />
            <Route path="/collaboration/:id" element={<CollaborationDetailsPage />} />
          </>
        )}

        {/* Route for Forgot Username page */}
        <Route path="/forgot/username" element={<ForgotUsername />} />

        {/* Route for Forgot Password page */}
        <Route path="/forgot/password" element={<ForgotPassword />} />
      </Routes>
    </Router>
  );
}

export default App;

