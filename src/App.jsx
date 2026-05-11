import { useState, useEffect } from 'react';
import Login from './Login';
import Dashboard from './Dashboard';
import { auth } from './firebase';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // مراقبة حالة تسجيل الدخول
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ 
        textAlign: 'center', 
        marginTop: '100px', 
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#666'
      }}>
        <div style={{ 
          width: '50px', 
          height: '50px', 
          border: '5px solid #f3f3f3', 
          borderTop: '5px solid #1e40af', 
          borderRadius: '50%', 
          margin: '0 auto 20px',
          animation: 'spin 1s linear infinite'
        }}></div>
        جاري تحميل التطبيق...
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div>
      {user ? <Dashboard /> : <Login />}
    </div>
  );
}

export default App;