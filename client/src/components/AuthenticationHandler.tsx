import React, { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useStateValue } from '../state/state';
import { getParameterByName } from '../utils/windowHelper'

/**
 * AuthenticationHandler
 *
 * This is the authentication handler of our App, handles the 'token' or 'error'
 * parameters at the '/authentication' route.
 *
 * If the token is valid, it stores it in the session storage and navigate the user back to '/' route.
 *
 * If error is attached to the parameters, navigates the user back to the Login Page.
 */
const AuthenticationHandler = () => {
    const navigate = useNavigate()
    const [state, dispatch] = useStateValue()

    useEffect(() => {
        const token = getParameterByName('token');
        const error = getParameterByName('error');

        if (error) {
            navigate('/pdalogin');
        }

        if (token) {
            sessionStorage.setItem('pdaOwnerToken', token)
            dispatch({ type: "SET_PDA_TOKEN", payload: token })
            navigate('/home');
        }
    }, [state.user.pdaOwnerToken, dispatch, navigate]);

    return <div>Loading...</div>;
}

export default AuthenticationHandler;
