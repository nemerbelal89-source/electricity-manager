import { useState, useEffect, useMemo } from 'react';
import { auth, db } from './firebase';
import { signInWithPhoneNumber, RecaptchaVerifier, signOut } from 'firebase/auth';
import { 
  collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot, 
  doc, setDoc, getDoc, updateDoc, where, getDocs, deleteDoc 
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const storage = getStorage();

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState('user');
  const [userName, setUserName] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  
  // متغيرات الإدخال
  const [readingInput, setReadingInput] = useState('');
  const [payInput, setPayInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [complaintText, setComplaintText] = useState('');
  const [selectedUserPhone, setSelectedUserPhone] = useState('');
  
  // إضافة مشترك جديد (للمشرف)
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserName, setNewUserName] = useState('');
  
  // حالات التحميل والرفع
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usersList, setUsersList] = useState([]);

  // البيانات
  const [readings, setReadings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [pricePerKwh, setPricePerKwh] = useState(0.50);

  // 1️⃣ مراقبة الدخول وتعيين الصلاحية والاسم
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          setUserRole(userData.role || 'user');
          setUserName(userData.name || currentUser.phoneNumber);
        } else {
          setUserRole('user');
          setUserName(currentUser.phoneNumber);
        }
      } else {
        setUser(null);
        setUserRole('user');
        setUserName('');
      }
    });
    return () => unsubscribe();
  }, []);

  // 2️⃣ جلب البيانات
  useEffect(() => {
    if (!user) return;

    // جلب القراءات
    const readingsQuery = userRole === 'admin' 
      ? query(collection(db, 'readings'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'readings'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    
    const unsubReadings = onSnapshot(readingsQuery, snap => {
      setReadings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // جلب الدفعات
    const paymentsQuery = userRole === 'admin'
      ? query(collection(db, 'payments'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'payments'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    
    const unsubPayments = onSnapshot(paymentsQuery, snap => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // جلب الشكاوي
    const complaintsQuery = userRole === 'admin'
      ? query(collection(db, 'complaints'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'complaints'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    
    const unsubComplaints = onSnapshot(complaintsQuery, snap => {
      setComplaints(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // جلب سعر الكيلو
    const fetchPrice = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'general'));
        if (snap.exists()) setPricePerKwh(snap.data().pricePerKwh || 0.50);
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    fetchPrice();

    return () => { 
      unsubReadings(); 
      unsubPayments(); 
      unsubComplaints(); 
    };
  }, [user, userRole]);

  // 3️⃣ جلب قائمة المشتركين (للمشرف فقط)
  useEffect(() => {
    if (userRole !== 'admin') return;
    const fetchUsers = async () => {
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'user')));
      setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchUsers();
  }, [userRole]);

  // 4️⃣ الحسابات
  const stats = useMemo(() => {
    const myReadings = readings.filter(r => r.userId === user?.uid).sort((a,b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
    const myPayments = payments.filter(p => p.userId === user?.uid && p.status === 'approved');
    
    if (myReadings.length === 0) return { current: 0, prev: 0, consumption: 0, totalCost: 0, approvedSum: 0, balance: 0 };

    const current = myReadings[0].readingValue;
    const prev = myReadings.length > 1 ? myReadings[1].readingValue : 0;
    const consumption = current - prev;
    const first = myReadings[myReadings.length - 1].readingValue;
    const totalConsumption = current - first;
    
    const approvedSum = myPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalCost = totalConsumption * pricePerKwh;
    const balance = approvedSum - totalCost;

    return { current, prev, consumption, totalCost, approvedSum, balance };
  }, [readings, payments, pricePerKwh, user]);

  // 5️⃣ دوال الإجراءات
  const handleSaveReading = async (targetUserId = user.uid) => {
    if (!readingInput) return alert('أدخل رقم العداد!');
    try {
      const targetUser = usersList.find(u => u.id === targetUserId) || { phoneNumber: user.phoneNumber };
      await addDoc(collection(db, 'readings'), { 
        userId: targetUserId, 
        phoneNumber: targetUser.phoneNumber, 
        readingValue: Number(readingInput), 
        createdAt: serverTimestamp(),
        recordedBy: user.phoneNumber 
      });
      alert('✅ تم تسجيل القراءة'); setReadingInput('');
    } catch (e) { alert('❌ ' + e.message); }
  };

  const handleSavePayment = async () => {
    if (!payInput || !receiptFile) return alert('أدخل المبلغ وارفق صورة الإشعار!');
    setUploading(true);
    try {
      const fileRef = ref(storage, `receipts/${user.uid}_${Date.now()}_${receiptFile.name}`);
      await uploadBytes(fileRef, receiptFile);
      const url = await getDownloadURL(fileRef);

      await addDoc(collection(db, 'payments'), {
        userId: user.uid, phoneNumber: user.phoneNumber, amount: Number(payInput),
        receiptUrl: url, status: 'pending', createdAt: serverTimestamp()
      });
      alert('💰 تم إرسال الدفعة للمراجعة'); setPayInput(''); setReceiptFile(null);
    } catch (e) { alert('❌ ' + e.message); }
    setUploading(false);
  };

  const handleAdminAction = async (id, action, collectionName) => {
    try {
      await updateDoc(doc(db, collectionName, id), { 
        status: action, 
        reviewedAt: serverTimestamp(), 
        reviewedBy: user.phoneNumber 
      });
      alert(action === 'approved' ? '✅ تم الاعتماد' : action === 'resolved' ? '✅ تم حل الشكوى' : '❌ تم الرفض');
    } catch (e) { alert('❌ ' + e.message); }
  };

  const handleSendComplaint = async () => {
    if (!complaintText) return alert('اكتب نص الشكوى!');
    try {
      await addDoc(collection(db, 'complaints'), {
        userId: user.uid,
        phoneNumber: user.phoneNumber,
        message: complaintText,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      alert('📢 تم إرسال الشكوى، سيقوم المشرف بالرد قريباً');
      setComplaintText('');
    } catch (e) { alert('❌ ' + e.message); }
  };

  const handleAdminReply = async (complaintId, reply) => {
    try {
      await updateDoc(doc(db, 'complaints', complaintId), {
        adminReply: reply,
        status: 'resolved',
        repliedAt: serverTimestamp()
      });
      alert('✅ تم الرد على الشكوى');
    } catch (e) { alert('❌ ' + e.message); }
  };

  const handleUpdatePrice = async () => {
    if (!priceInput) return;
    await setDoc(doc(db, 'settings', 'general'), { pricePerKwh: Number(priceInput) }, { merge: true });
    setPricePerKwh(Number(priceInput)); setPriceInput(''); alert('✅ تم تحديث السعر');
  };

  // 🆕 إضافة مشترك جديد (للمشرف) - مع التحقق من رقم فلسطين (مُصحح)
  const handleAddNewUser = async () => {
    if (!newUserPhone || !newUserName) {
      alert('الرجاء إدخال رقم الهاتف والاسم!');
      return;
    }
    
    // ✅ تم التعديل: قبول 9 أرقام بعد +970 (مثال: +970599123456)
    const palestinePhoneRegex = /^\+970[5-9]\d{8}$/;
    
    if (!palestinePhoneRegex.test(newUserPhone)) {
      alert('❌ الرجاء إدخال رقم هاتف فلسطيني صحيح!\nمثال: +970599123456');
      return;
    }
    
    try {
      // التحقق من عدم وجود الرقم مسبقاً
      const existingUser = await getDocs(
        query(collection(db, 'users'), where('phoneNumber', '==', newUserPhone))
      );
      
      if (!existingUser.empty) {
        alert('⚠️ هذا الرقم مسجل مسبقاً في النظام!');
        return;
      }
      
      // توليد UID عشوائي للمستخدم الجديد
      const newUserId = 'user_' + Date.now();
      
      await setDoc(doc(db, 'users', newUserId), {
        phoneNumber: newUserPhone,
        name: newUserName,
        role: 'user',
        createdAt: serverTimestamp(),
        createdBy: user.phoneNumber,
        status: 'active'
      });
      
      alert(`✅ تم إضافة المشترك بنجاح!\n\nالاسم: ${newUserName}\nرقم الهاتف: ${newUserPhone}\n\nيمكن للمشترك الآن تسجيل الدخول باستخدام رقم هاتفه!`);
      
      setNewUserPhone('');
      setNewUserName('');
      
      // تحديث قائمة المشتركين
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'user')));
      setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      
    } catch (e) {
      alert('❌ خطأ في إضافة المشترك: ' + e.message);
    }
  };

  // 🗑️ حذف مشترك (للمشرف فقط)
  const handleDeleteUser = async (userId, userName, userPhone) => {
    if (!confirm(`⚠️ هل أنت متأكد من حذف المشترك؟\n\nالاسم: ${userName}\nرقم الهاتف: ${userPhone}\n\nسيتم حذف جميع بياناته (قراءات، دفعات، شكاوي)!`)) {
      return;
    }
    
    try {
      // حذف القراءات الخاصة بالمستخدم
      const readingsSnap = await getDocs(query(collection(db, 'readings'), where('userId', '==', userId)));
      const readingDeletes = readingsSnap.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(readingDeletes);
      
      // حذف الدفعات
      const paymentsSnap = await getDocs(query(collection(db, 'payments'), where('userId', '==', userId)));
      const paymentDeletes = paymentsSnap.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(paymentDeletes);
      
      // حذف الشكاوي
      const complaintsSnap = await getDocs(query(collection(db, 'complaints'), where('userId', '==', userId)));
      const complaintDeletes = complaintsSnap.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(complaintDeletes);
      
      // حذف المستخدم نفسه
      await deleteDoc(doc(db, 'users', userId));
      
      alert('✅ تم حذف المشترك وجميع بياناته بنجاح!');
      
      // تحديث القائمة
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'user')));
      setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      
    } catch (e) {
      alert('❌ خطأ في الحذف: ' + e.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };
  
  const formatDate = (ts) => ts?.toDate?.()?.toLocaleString('ar-IQ') || '-';

  if (!user) return null;

  return (
    <div style={{ fontFamily: 'Tahoma, sans-serif', direction: 'rtl', maxWidth: '900px', margin: '0 auto', padding: '20px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      
      {/* الرأس */}
      <header style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)', color: 'white', padding: '20px', borderRadius: '15px', marginBottom: '20px', textAlign: 'center' }}>
        <h1 style={{ margin: 0 }}>⚡ إدارة الكهرباء</h1>
        <p style={{ margin: '5px 0 10px', opacity: 0.9 }}>
          {userName} {userRole === 'admin' && '👑 (مشرف)'}
        </p>
        <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: 'white', padding: '6px 16px', borderRadius: '20px', cursor: 'pointer' }}>خروج</button>
      </header>

      {/* أزرار التنقل */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <TabBtn id="home" label="🏠 الرئيسية" active={activeTab} set={setActiveTab} />
        {userRole === 'admin' && <TabBtn id="read" label="📝 قراءة" active={activeTab} set={setActiveTab} />}
        <TabBtn id="pay" label="💰 دفع" active={activeTab} set={setActiveTab} />
        <TabBtn id="complaints" label="📢 شكاوي" active={activeTab} set={setActiveTab} />
        <TabBtn id="history" label="📜 السجل" active={activeTab} set={setActiveTab} />
        {userRole === 'admin' && (
          <>
            <TabBtn id="users" label="👥 مشتركين" active={activeTab} set={setActiveTab} />
            <TabBtn id="admin" label="👑 لوحة المشرف" active={activeTab} set={setActiveTab} />
          </>
        )}
      </div>

      {/* المحتوى */}
      <div style={{ background: 'white', padding: '20px', borderRadius: '15px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        
        {/* 🏠 الرئيسية */}
        {activeTab === 'home' && (
          <div>
            <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>📊 ملخص حسابي</h2>
            {loading ? <p>جاري التحميل...</p> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                <Card label="القراءة السابقة" val={stats.prev} unit="kWh" bg="#e0f2fe" />
                <Card label="القراءة الحالية" val={stats.current} unit="kWh" bg="#dbeafe" />
                <Card label="استهلاك الفترة" val={stats.consumption} unit="kWh" bg="#fef3c7" highlight />
                <Card label="المدفوع (معتمد)" val={stats.approvedSum.toFixed(2)} unit="₪" bg="#dcfce7" />
                <Card label="الرصيد" val={stats.balance.toFixed(2)} unit="₪" bg={stats.balance >= 0 ? "#dcfce7" : "#fee2e2"} highlight />
              </div>
            )}
          </div>
        )}

        {/* 📝 تسجيل قراءة (للمشرف فقط) */}
        {activeTab === 'read' && userRole === 'admin' && (
          <div style={{ textAlign: 'center' }}>
            <h2>📝 تسجيل قراءة لمشترك</h2>
            <select value={selectedUserPhone} onChange={e => setSelectedUserPhone(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: '10px' }}>
              <option value="">اختر المشترك...</option>
              {usersList.map(u => <option key={u.id} value={u.id}>{u.phoneNumber} - {u.name}</option>)}
            </select>
            <input type="number" value={readingInput} onChange={e => setReadingInput(e.target.value)} placeholder="رقم العداد..." style={inputStyle} />
            <button onClick={() => handleSaveReading(selectedUserPhone)} style={btnPrimary}>حفظ القراءة</button>
          </div>
        )}

        {/* 💰 دفع */}
        {activeTab === 'pay' && (
          <div style={{ textAlign: 'center' }}>
            <h2>💰 تسجيل دفعة مالية</h2>
            <input type="number" value={payInput} onChange={e => setPayInput(e.target.value)} placeholder="المبلغ بالشيكل..." style={inputStyle} />
            <label style={{ display: 'block', margin: '10px 0', cursor: 'pointer', background: '#f1f5f9', padding: '10px', borderRadius: '8px' }}>
              📎 ارفق صورة إشعار التحويل
              <input type="file" accept="image/*" onChange={e => setReceiptFile(e.target.files[0])} style={{ display: 'none' }} />
            </label>
            {receiptFile && <p style={{ color: '#16a34a' }}>✅ تم اختيار: {receiptFile.name}</p>}
            <button onClick={handleSavePayment} disabled={uploading} style={{ ...btnPrimary, opacity: uploading ? 0.7 : 1 }}>
              {uploading ? 'جاري الرفع...' : 'إرسال للمراجعة'}
            </button>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>سيتم ترصيد المبلغ بعد اعتماد المشرف</p>
          </div>
        )}

        {/* 📢 الشكاوي */}
        {activeTab === 'complaints' && (
          <div>
            <h2 style={{ textAlign: 'center' }}>📢 {userRole === 'admin' ? 'شكاوي المشتركين' : 'تقديم شكوى / استفسار'}</h2>
            
            {userRole !== 'admin' && (
              <>
                <textarea value={complaintText} onChange={e => setComplaintText(e.target.value)} placeholder="اكتب شكواك هنا..." style={{ ...inputStyle, minHeight: '100px', textAlign: 'right' }} />
                <button onClick={handleSendComplaint} style={btnPrimary}>إرسال الشكوى</button>
              </>
            )}
            
            <h3 style={{ marginTop: '30px', borderBottom: '2px solid #1e40af', paddingBottom: '8px' }}>
              {userRole === 'admin' ? 'جميع الشكاوي' : 'شكاويي السابقة'}
            </h3>
            {complaints.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center' }}>لا توجد شكاوي</p>
            ) : (
              complaints.map(c => (
                <div key={c.id} style={{ padding: '12px', margin: '10px 0', background: '#f8fafc', borderRadius: '8px', borderRight: `4px solid ${c.status === 'resolved' ? '#16a34a' : '#f59e0b'}` }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 'bold' }}>{c.message}</p>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                    {c.phoneNumber} | {formatDate(c.createdAt)}
                  </p>
                  {c.adminReply && <p style={{ margin: '8px 0 0', padding: '8px', background: '#dbeafe', borderRadius: '6px', color: '#1e40af' }}>🔹 رد المشرف: {c.adminReply}</p>}
                  <StatusBadge status={c.status} />
                </div>
              ))
            )}
          </div>
        )}

        {/* 👥 إدارة المشتركين (للمشرف فقط) */}
        {activeTab === 'users' && userRole === 'admin' && (
          <div>
            <h2 style={{ textAlign: 'center' }}>👥 إدارة المشتركين</h2>
            
            {/* نموذج إضافة مشترك جديد */}
            <div style={{ padding: '20px', background: '#f0f9ff', borderRadius: '12px', marginBottom: '30px', border: '2px solid #0ea5e9' }}>
              <h3 style={{ marginTop: 0, color: '#0369a1' }}>➕ إضافة مشترك جديد (فلسطين)</h3>
              
              <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '8px', marginBottom: '15px', fontSize: '14px', color: '#92400e' }}>
                📌 <strong>ملاحظة:</strong> يجب أن يكون رقم الهاتف فلسطيني (+970). بعد الإضافة، يمكن للمشترك تسجيل الدخول فوراً باستخدام رقم هاتفه.
              </div>
              
              <input 
                type="text" 
                value={newUserName}
                onChange={e => setNewUserName(e.target.value)}
                placeholder="اسم المشترك الكامل" 
                style={{ ...inputStyle, textAlign: 'right' }} 
              />
              <input 
                type="tel" 
                value={newUserPhone}
                onChange={e => setNewUserPhone(e.target.value)}
                placeholder="رقم الهاتف الفلسطيني (مثال: +970599123456)" 
                style={inputStyle} 
              />
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '15px', textAlign: 'right' }}>
                💡 الصيغة الصحيحة: +9705xxxxxxxx (يجب أن يبدأ بـ +970)
              </div>
              <button onClick={handleAddNewUser} style={{ ...btnPrimary, background: '#059669' }}>
                ➕ إضافة المشترك
              </button>
            </div>

            {/* قائمة المشتركين */}
            <h3>📋 قائمة المشتركين ({usersList.length})</h3>
            
            {usersList.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>
                لا يوجد مشتركين مسجلين
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={th}>الاسم</th>
                    <th style={th}>رقم الهاتف</th>
                    <th style={th}>تاريخ التسجيل</th>
                    <th style={th}>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map(u => (
                    <tr key={u.id} style={{ textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>
                      <td style={td}>{u.name}</td>
                      <td style={{ ...td, direction: 'ltr' }}>{u.phoneNumber}</td>
                      <td style={td}>{formatDate(u.createdAt)}</td>
                      <td style={td}>
                        <button 
                          onClick={() => handleDeleteUser(u.id, u.name, u.phoneNumber)}
                          style={{ 
                            ...btnSmall, 
                            background: '#dc2626', 
                            color: 'white',
                            padding: '6px 12px'
                          }}
                        >
                          🗑️ حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 👑 لوحة المشرف */}
        {activeTab === 'admin' && userRole === 'admin' && (
          <div>
            <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>👑 لوحة تحكم المشرف</h2>
            
            {/* اعتماد الدفعات */}
            <h3 style={{ borderBottom: '2px solid #16a34a', paddingBottom: '8px' }}>💰 الدفعات قيد المراجعة</h3>
            {payments.filter(p => p.status === 'pending').length === 0 ? (
              <p style={{ color: '#94a3b8', padding: '10px' }}>لا توجد دفعات معلقة</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                <thead><tr style={{ background: '#f8fafc' }}><th style={th}>المشترك</th><th style={th}>المبلغ</th><th style={th}>الإشعار</th><th style={th}>إجراء</th></tr></thead>
                <tbody>
                  {payments.filter(p => p.status === 'pending').map(p => (
                    <tr key={p.id} style={{ textAlign: 'center' }}>
                      <td style={td}>{p.phoneNumber}</td>
                      <td style={td}>{p.amount} ₪</td>
                      <td style={td}><a href={p.receiptUrl} target="_blank" style={{ color: '#2563eb' }}>عرض</a></td>
                      <td style={td}>
                        <button onClick={() => handleAdminAction(p.id, 'approved', 'payments')} style={{ ...btnSmall, background: '#16a34a', color: 'white', marginRight: '5px' }}>اعتماد ✅</button>
                        <button onClick={() => handleAdminAction(p.id, 'rejected', 'payments')} style={{ ...btnSmall, background: '#dc2626', color: 'white' }}>رفض ❌</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* الرد على الشكاوي */}
            <h3 style={{ borderBottom: '2px solid #f59e0b', paddingBottom: '8px', marginTop: '30px' }}>📢 الشكاوي المعلقة</h3>
            {complaints.filter(c => c.status === 'pending').length === 0 ? (
              <p style={{ color: '#94a3b8', padding: '10px' }}>لا توجد شكاوي معلقة</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                <thead><tr style={{ background: '#f8fafc' }}><th style={th}>المشترك</th><th style={th}>الشكوى</th><th style={th}>الرد</th><th style={th}>إجراء</th></tr></thead>
                <tbody>
                  {complaints.filter(c => c.status === 'pending').map(c => (
                    <tr key={c.id} style={{ textAlign: 'center' }}>
                      <td style={td}>{c.phoneNumber}</td>
                      <td style={{ ...td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.message}</td>
                      <td style={td}>
                        <input type="text" id={`reply-${c.id}`} placeholder="اكتب الرد..." style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%' }} />
                      </td>
                      <td style={td}>
                        <button onClick={() => {
                          const reply = document.getElementById(`reply-${c.id}`).value;
                          if (reply) handleAdminReply(c.id, reply);
                          else alert('اكتب رد أولاً');
                        }} style={{ ...btnSmall, background: '#7c3aed', color: 'white' }}>إرسال الرد ✉️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* تحديث سعر الكيلو */}
            <div style={{ marginTop: '30px', padding: '15px', background: '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
              <h3>⚙️ تحديث سعر الكيلو واط</h3>
              <p>السعر الحالي: <strong>{pricePerKwh} ₪</strong></p>
              <input type="number" step="0.01" value={priceInput} onChange={e => setPriceInput(e.target.value)} placeholder="السعر الجديد..." style={{ ...inputStyle, maxWidth: '200px', margin: '10px auto' }} />
              <button onClick={handleUpdatePrice} style={{ ...btnPrimary, maxWidth: '200px', margin: '0 auto' }}>تحديث السعر</button>
            </div>
          </div>
        )}

        {/* 📜 السجل */}
        {activeTab === 'history' && (
          <div>
            <h2 style={{ textAlign: 'center' }}>📜 سجل الدفعات</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px' }}>
              <thead><tr style={{ background: '#f8fafc' }}><th style={th}>المبلغ</th><th style={th}>الحالة</th><th style={th}>التاريخ</th></tr></thead>
              <tbody>
                {payments.filter(p => p.userId === user.uid).map(p => (
                  <tr key={p.id} style={{ textAlign: 'center' }}>
                    <td style={td}>{p.amount} ₪</td>
                    <td style={td}><StatusBadge status={p.status} /></td>
                    <td style={td}>{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}

// 🔹 مكونات مساعدة
function TabBtn({ id, label, active, set }) {
  return (
    <button onClick={() => set(id)} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', background: active === id ? '#1e40af' : 'white', color: active === id ? 'white' : '#333', minWidth: '100px' }}>
      {label}
    </button>
  );
}
function Card({ label, val, unit, bg, highlight }) {
  return (
    <div style={{ background: bg, padding: '15px', borderRadius: '12px', textAlign: 'center', border: highlight ? '2px solid #cbd5e1' : 'none' }}>
      <div style={{ fontSize: '13px', color: '#475569', marginBottom: '5px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a' }}>{val} <span style={{ fontSize: '12px' }}>{unit}</span></div>
    </div>
  );
}
function StatusBadge({ status }) {
  const styles = { 
    approved: { bg: '#dcfce7', color: '#166534', text: 'معتمد ✅' }, 
    pending: { bg: '#fef3c7', color: '#92400e', text: 'قيد الانتظار ⏳' }, 
    rejected: { bg: '#fee2e2', color: '#991b1b', text: 'مرفوض ❌' },
    resolved: { bg: '#dbeafe', color: '#1e40af', text: 'تم الرد ✉️' }
  };
  const s = styles[status] || styles.pending;
  return <span style={{ padding: '4px 10px', borderRadius: '12px', background: s.bg, color: s.color, fontSize: '12px', fontWeight: 'bold' }}>{s.text}</span>;
}

// 🔹 أنماط موحدة
const inputStyle = { width: '100%', padding: '14px', margin: '15px 0', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '16px', textAlign: 'center', boxSizing: 'border-box' };
const btnPrimary = { width: '100%', padding: '14px', background: '#1e40af', color: 'white', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold' };
const btnSmall = { padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' };
const th = { padding: '12px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#475569' };
const td = { padding: '10px', border: '1px solid #e2e8f0', fontSize: '14px' };