import { useState, useEffect } from 'react';
import { signInWithPhoneNumber, RecaptchaVerifier, signOut } from 'firebase/auth';
import { auth } from './firebase';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1); // 1: إدخال الرقم، 2: إدخال الرمز
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // تجهيز reCAPTCHA عند تحميل المكون
  useEffect(() => {
    setupRecaptcha();
    return () => {
      // تنظيف عند الخروج
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        delete window.recaptchaVerifier;
      }
    };
  }, []);

  // إعداد reCAPTCHA الخفي
  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved
        },
        'expired-callback': () => {
          // Reset reCAPTCHA if expired
          window.recaptchaVerifier?.render().then((widgetId) => {
            grecaptcha.reset(widgetId);
          });
        }
      });
    }
  };

  // إرسال رمز التحقق (OTP)
  const sendOTP = async () => {
    if (!phone) {
      setError('الرجاء إدخال رقم الهاتف');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      setupRecaptcha();
      
      // تنسيق الرقم: التأكد من وجود رمز الدولة
      const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
      
      const confirmation = await signInWithPhoneNumber(
        auth, 
        formattedPhone, 
        window.recaptchaVerifier
      );
      
      setConfirmationResult(confirmation);
      setStep(2);
      alert('✅ تم إرسال رمز التحقق إلى هاتفك');
      
    } catch (err) {
      console.error('Error sending OTP:', err);
      setError('❌ خطأ: ' + (err.message || 'فشل إرسال الرمز'));
      
      // إعادة تعيين reCAPTCHA في حالة الخطأ
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        delete window.recaptchaVerifier;
      }
    } finally {
      setLoading(false);
    }
  };

  // التحقق من رمز OTP وتسجيل الدخول
  const verifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      setError('الرجاء إدخال رمز مكون من 6 أرقام');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const result = await confirmationResult.confirm(otp);
      // ✅ نجاح تسجيل الدخول
      // ملاحظة: App.jsx سيكتشف التغيير ويعرض Dashboard تلقائياً
      console.log('✅ User signed in:', result.user);
      
    } catch (err) {
      console.error('Error verifying OTP:', err);
      setError('❌ رمز غير صحيح أو منتهي الصلاحية');
      setStep(1); // العودة لإدخال الرقم مجدداً
    } finally {
      setLoading(false);
    }
  };

  // إعادة إرسال الرمز
  const resendOTP = async () => {
    setStep(1);
    setOtp('');
    setError('');
    // إعادة المحاولة بعد ثانية واحدة
    setTimeout(() => {
      sendOTP();
    }, 1000);
  };

  // تسجيل الخروج (لأغراض الاختبار)
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setStep(1);
      setPhone('');
      setOtp('');
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  return (
    <div style={{ 
      padding: 20, 
      maxWidth: 400, 
      margin: '40px auto', 
      textAlign: 'center', 
      fontFamily: 'Arial, sans-serif',
      backgroundColor: 'white',
      borderRadius: 16,
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
    }}>
      <h2 style={{ margin: '0 0 20px', color: '#1e40af' }}>⚡ تسجيل الدخول</h2>
      
      {/* عرض الأخطاء */}
      {error && (
        <div style={{ 
          backgroundColor: '#fee2e2', 
          color: '#991b1b', 
          padding: '10px', 
          borderRadius: 8, 
          marginBottom: 15,
          fontSize: 14
        }}>
          {error}
        </div>
      )}
      
      {step === 1 ? (
        // الخطوة 1: إدخال رقم الهاتف
        <>
          <p style={{ color: '#666', marginBottom: 20, fontSize: 14 }}>
            أدخل رقم هاتفك لتلقي رمز التحقق
          </p>
          
          <input
            type="tel"
            placeholder="مثال: +9647701234567"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setError('');
            }}
            disabled={loading}
            style={{ 
              width: '100%', 
              padding: 14, 
              marginBottom: 15, 
              fontSize: 16, 
              direction: 'ltr',
              border: '2px solid #e2e8f0',
              borderRadius: 10,
              boxSizing: 'border-box',
              textAlign: 'center'
            }}
          />
          
          <div id="recaptcha-container" style={{ marginBottom: 15 }}></div>
          
          <button 
            onClick={sendOTP} 
            disabled={loading || !phone}
            style={{ 
              width: '100%', 
              padding: 14, 
              backgroundColor: loading ? '#93c5fd' : '#1e40af', 
              color: 'white', 
              border: 'none', 
              borderRadius: 10, 
              fontSize: 16, 
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              transition: 'background 0.2s'
            }}
          >
            {loading ? 'جاري الإرسال...' : 'إرسال رمز التحقق 📱'}
          </button>
          
          <p style={{ marginTop: 15, fontSize: 12, color: '#94a3b8' }}>
            💡 تأكد من إدخال رمز الدولة (+964 للعراق)
          </p>
        </>
      ) : (
        // الخطوة 2: إدخال رمز التحقق
        <>
          <p style={{ color: '#666', marginBottom: 20, fontSize: 14 }}>
            تم إرسال الرمز إلى: <strong>{phone}</strong>
          </p>
          
          <input
            type="text"
            placeholder="أدخل الرمز (6 أرقام)"
            value={otp}
            onChange={(e) => {
              // السماح بالأرقام فقط
              const value = e.target.value.replace(/[^0-9]/g, '');
              setOtp(value);
              setError('');
            }}
            maxLength={6}
            disabled={loading}
            style={{ 
              width: '100%', 
              padding: 14, 
              marginBottom: 15, 
              fontSize: 20, 
              textAlign: 'center', 
              letterSpacing: 8,
              border: '2px solid #e2e8f0',
              borderRadius: 10,
              boxSizing: 'border-box',
              direction: 'ltr'
            }}
          />
          
          <button 
            onClick={verifyOTP} 
            disabled={loading || otp.length !== 6}
            style={{ 
              width: '100%', 
              padding: 14, 
              backgroundColor: loading ? '#6ee7b7' : '#059669', 
              color: 'white', 
              border: 'none', 
              borderRadius: 10, 
              fontSize: 16, 
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              marginBottom: 10,
              transition: 'background 0.2s'
            }}
          >
            {loading ? 'جاري التحقق...' : 'تأكيد وتسجيل الدخول ✅'}
          </button>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10 }}>
            <button 
              onClick={resendOTP}
              disabled={loading}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: '#1e40af', 
                cursor: loading ? 'not-allowed' : 'pointer', 
                fontSize: 14,
                textDecoration: 'underline'
              }}
            >
              🔄 إعادة إرسال الرمز
            </button>
            
            <button 
              onClick={() => {
                setStep(1);
                setOtp('');
                setError('');
              }}
              disabled={loading}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: '#64748b', 
                cursor: loading ? 'not-allowed' : 'pointer', 
                fontSize: 14,
                textDecoration: 'underline'
              }}
            >
              ✏️ تغيير الرقم
            </button>
          </div>
        </>
      )}
      
      {/* زر تسجيل الخروج للاختبار */}
      <div style={{ marginTop: 30, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
        <button 
          onClick={handleLogout}
          style={{ 
            background: 'none', 
            border: '1px solid #cbd5e1', 
            color: '#64748b', 
            padding: '8px 16px', 
            borderRadius: 20, 
            cursor: 'pointer',
            fontSize: 12
          }}
        >
          🚪 تسجيل خروج (للاختبار)
        </button>
      </div>
    </div>
  );
}