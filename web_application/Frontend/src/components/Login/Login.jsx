import Navigation from "../Navigation/Navigation";
import banner from "../../assets/banner.gif";
import lockIcon from "../../assets/lock_icon.png";
import userIcon from "../../assets/user_icon.png";
import keyIcon from "../../assets/key_icon.png";
import { GoogleLogin } from '@react-oauth/google';
import "./Login.css";

const Login = () => {
  const responseMessage = (response) => {
    console.log(response);
  };
  const errorMessage = (error) => {
      console.log(error);
  };

  return (

    <div className="login_wrapper">
      {/* <Navigation /> */}

      <div className="login_container container">
        <div className="row g-5">
          <div className="col-lg-6 p-4 p-lg-0">
            <div className="login_box">
              <div className="form_container">
                <div className="form_header">
                  <img src={lockIcon} alt="" />
                  <h2>Login</h2>
                  <p>Sign in to your account</p>
                </div>

                <div className="form_body">
                  <div className="input_box">
                    <img src={userIcon} alt="" />
                    <input type="text" placeholder="Username" />
                  </div>
                  <div className="input_box">
                    <img src={keyIcon} alt="" />
                    <input type="password" placeholder="Password" />
                  </div>
                  <button className="login_btn">Login</button>
                  <div className="google_btn">
                    <GoogleLogin onSuccess={responseMessage} onError={errorMessage} />
                  </div>
                  <div className="text-center">
                    <button className="forget_btn">
                      I forgot my password. Click here to reset
                    </button>
                  </div>
                  <button className="register_btn">Register New Account</button>
                </div>
              </div>
            </div>
          </div>
          <div className="col-lg-6 p-4 p-lg-0">
            <div className="banner_container">
              {/* <img src={banner} alt="" className="img-fluid h-100" /> */}
            </div>
          </div>
        </div>
      </div>

      

      <div className="bg_elm_1"></div>
      <div className="bg_elm_2"></div>
    </div>
  );
};

export default Login;
