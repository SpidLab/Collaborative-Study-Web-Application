import React from 'react'
import './header.css';
import people from '../../assets/people.png'
import ai from '../../assets/ai.png'
import Group8 from '../../assets/Group8.png'
import Sequence2 from '../../assets/Sequence2.gif'

const Header = () => {
  return (
    <div className = "gpt3_header section_padding" id = "home">

      <div className = "gpt3_header-content">
        <div className = "gpt3_header-content_input">
        <div className = "gpt3_header-content_lock" >
          <img src = {Group8} alt = "lock" />
        </div>
        <p>Login</p>
        <p>Sign in to your account</p>
          <input type = "email" placeholder = "Username" />
          <div className = "gpt3_header-content_password">
          <input type = "email" placeholder = "Password" />
          </div>
          <button type = "button">Login</button>
          <p>I forgot my password. Click here to reset</p>
          <button type = "button">Register New Account</button>
        </div>


      </div>
      <div className = "gpt3_header-image" >
          <img src = {Sequence2} alt = "Sequence2" />
        </div>
    </div>
  )
}

export default Header