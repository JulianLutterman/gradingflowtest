import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { supabase } from '../services/supabaseClient.js';

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [formState, setFormState] = useState({
    email: '',
    password: '',
    fullName: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      if (mode === 'signup') {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: formState.email,
          password: formState.password,
          options: { data: { full_name: formState.fullName } },
        });

        if (signupError) throw signupError;
        if (data.user) {
          setSuccess('Signup successful! Please verify your email before logging in.');
          setMode('login');
        }
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: formState.email,
          password: formState.password,
        });

        if (loginError) throw loginError;
        navigate('/', { replace: true });
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page page-login">
      <div className="container login-container">
        <h1>{mode === 'login' ? 'Sign in to GradingFlow' : 'Create a GradingFlow account'}</h1>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'signup' && (
            <div className="form-group">
              <label htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="Jane Doe"
                value={formState.fullName}
                onChange={handleChange}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={formState.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={formState.password}
              onChange={handleChange}
              required
            />
          </div>

          {error && <p className="form-error">{error}</p>}
          {success && <p className="form-success">{success}</p>}

          <button type="submit" className="pushable-button" disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="form-switch">
          {mode === 'login' ? (
            <>
              Need an account?{' '}
              <Link
                to="#signup"
                onClick={(event) => {
                  event.preventDefault();
                  setMode('signup');
                }}
              >
                Sign up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link
                to="#login"
                onClick={(event) => {
                  event.preventDefault();
                  setMode('login');
                }}
              >
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
