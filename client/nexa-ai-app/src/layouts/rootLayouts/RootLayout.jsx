import './rootLayout.css';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ClerkProvider, SignInButton,  UserButton } from '@clerk/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing publishable key.');
}

const queryClient = new QueryClient();

const RootLayout = () => {
  const { pathname } = useLocation();
  const isDashboard = pathname.startsWith('/dashboard');

  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <QueryClientProvider client={queryClient}>
    <div className="rootLayout">
        <header className={isDashboard ? 'dashboardHeader' : ''}>
            <Link to="/" className='logo'>
                <img src="/assets/logo.png" alt=" "/> 
                <span>NEXA AI</span>
            </Link>
            <div className='user'>
              <SignInButton>
                <UserButton />
              </SignInButton>
            </div>
        </header>
        <main>
            <Outlet />
        </main>
    </div>
    </QueryClientProvider>
    </ClerkProvider>
  );
};

export default RootLayout;
