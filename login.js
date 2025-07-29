// --- CONFIGURATION ---
const SUPABASE_URL = 'https://uagiatfoiwusxafxskvp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZ2lhdGZvaXd1c3hhZnhza3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyODc0NjYsImV4cCI6MjA2NDg2MzQ2Nn0.b0wIEHgENkhzkp3qHAotqbLTq7BwsqgM7b0ksAl3h1U';

// --- SUPABASE CLIENT ---
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DOM ELEMENTS ---
const loginView = document.getElementById('login-view');
const signupView = document.getElementById('signup-view');
const showSignup = document.getElementById('show-signup');
const showLogin = document.getElementById('show-login');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

// --- AUTHENTICATION LOGIC ---
showSignup.addEventListener('click', () => {
    loginView.classList.add('hidden');
    signupView.classList.remove('hidden');
});

showLogin.addEventListener('click', () => {
    signupView.classList.add('hidden');
    loginView.classList.remove('hidden');
});

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
    });

    if (error) {
        alert(`Signup Error: ${error.message}`);
    } else {
        alert('Signup successful! Please check your email to verify your account.');
        signupForm.reset();
        showLogin.click(); // Switch to login view after signup
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
        alert(`Login Error: ${error.message}`);
    } else {
        loginForm.reset();
        window.location.href = 'index.html'; // Redirect on successful login
    }
});

// --- AUTH STATE HANDLING ---
// Listen for auth state changes
sb.auth.onAuthStateChange((event, session) => {
    if (session) {
        // If user is logged in, redirect to the main app
        window.location.href = 'index.html';
    }
});

// Check initial auth state when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        window.location.href = 'index.html';
    }
});