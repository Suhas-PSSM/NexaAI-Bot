import { Link } from 'react-router-dom';
import './homepage.css';
import { TypeAnimation } from 'react-type-animation';
import { useState } from 'react';

const Homepage = () => {

  const [typingStatus, setTypingStatus] = useState('human1');

  return (
    <div className="homepage">
      <img src="/assets/orbit.jpg" alt="" className="orbit" />
     <div className='left'>
        <h1>Nexa AI</h1>
        <h2>Supercharge your creativity and productivity</h2>
        <h3>Where innovation meets intelligence. Transform your ideas into powerful digital solutions.</h3>
        <Link to="/dashboard">Get Started</Link>
     </div>
     <div className='right'>
      <div className='imgContainer'>
        <div className='bgContainer'>
          <div className='bg'></div>
        </div>
        <img src="/assets/bot.png" alt="" className='bot' />
        <div className="chat">
          <img src={typingStatus === 'human1' ? "/assets/human1.jpg" : typingStatus === 'human2' ? "/assets/human2.png" : "/assets/bot.png"} alt="" />
           <TypeAnimation
      sequence={[
        // Same substring at the start will only be typed out once, initially
        'Human1: What can your AI do?',
        2000, () => {
          setTypingStatus('bot')
        },
        'Bot: I can analyze data, answer questions, and automate tasks.',
        2000,() => {
          setTypingStatus('human2')
        },
        'Human2: Can you help with real-time decision making?',
        2000,() => {
          setTypingStatus('bot')
        },
        'Bot: Yes, I provide real-time insights and recommendations.',
        2000,() => {
          setTypingStatus('human1')
        }
      ]}
      wrapper="span"
      repeat={Infinity}
      cursor={true}
      omitDeletionAnimation={true}
    />
        </div>
        </div>
     </div>
     <div className="terms">
      <img src='/assets/logo.png' alt="" />
      <div className="links">
        <Link to="/">Terms of Service</Link>
        <span>|</span>
        <Link to="/">Privacy Policy</Link>
      </div>
     </div>
    </div>
  );
};

export default Homepage;