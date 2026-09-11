import { SignIn } from '@clerk/react';
import './signInPage.css';

const SignInPage = () => {
  return (
    <div className="signInPage">
      <SignIn path="/sign-in" signUpUrl='/sign-up' forceRedirectUrl='/dashboard'/>
    </div>
  );
};

export default SignInPage;