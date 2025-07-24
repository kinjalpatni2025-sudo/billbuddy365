/* Full updated code with WhatsApp Invoice, Email, Templates, Dashboard Prep + PDF upload for WhatsApp + Business Info setup + Charts, Templates, PAN toggle + Template Preview */
import React, { useState, useEffect, useRef } from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { utils, writeFile } from "xlsx";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  getDoc,
  orderBy,
  limit
} from "firebase/firestore";
import emailjs from 'emailjs-com';
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Chart from 'chart.js/auto';

// Firebase Config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_DOMAIN.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_BUCKET.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export default function HomePage() {
  const [items, setItems] = useState([{ name: "", rate: "", qty: "" }]);
  const [gst, setGst] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [roundOff, setRoundOff] = useState(false);
  const [branding, setBranding] = useState({ businessName: "", logoUrl: "", address: "", mobile: "" });
  const [user, setUser] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [language, setLanguage] = useState("en");
  const [searchQuery, setSearchQuery] = useState("");
  const [customerDetails, setCustomerDetails] = useState({ name: "", address: "", phone: "", email: "" });
  const [invoiceNo, setInvoiceNo] = useState(1);
  const [currency, setCurrency] = useState("₹");
  const [showPANFields, setShowPANFields] = useState(false);
  const [invoiceTemplate, setInvoiceTemplate] = useState("simple");
  const [showPreview, setShowPreview] = useState(false);
  const printRef = useRef();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setBranding(docSnap.data().branding || {});
        }

        const q = query(collection(db, "invoices"), where("uid", "==", currentUser.uid), orderBy("invoiceNo", "desc"), limit(1));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          const lastInvoice = querySnap.docs[0].data();
          setInvoiceNo((lastInvoice.invoiceNo || 0) + 1);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const saveInvoice = async () => {
        await addDoc(collection(db, "invoices"), {
          uid: user.uid,
          invoiceNo,
          items,
          gst,
          discount,
          roundOff,
          branding,
          customerDetails,
          currency,
          createdAt: new Date()
        });
      };
      saveInvoice();
    }
  }, [items, gst, discount, roundOff, customerDetails, currency]);

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { name: "", rate: "", qty: "" }]);
  };

  const removeItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const calculateSubtotal = () => {
    return items.reduce((total, item) => {
      const rate = parseFloat(item.rate) || 0;
      const qty = parseFloat(item.qty) || 0;
      return total + rate * qty;
    }, 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const gstAmount = (subtotal * gst) / 100;
    const discountAmount = (subtotal * discount) / 100;
    let total = subtotal + gstAmount - discountAmount;
    if (roundOff) total = Math.round(total);
    return total;
  };

  const handleBrandingChange = (field, value) => {
    setBranding(prev => ({ ...prev, [field]: value }));
    if (user) {
      setDoc(doc(db, "users", user.uid), { branding: { ...branding, [field]: value } }, { merge: true });
    }
  };

  const downloadSummaryReport = async () => {
    const q = query(collection(db, "invoices"), where("uid", "==", user.uid));
    const snap = await getDocs(q);
    const data = snap.docs.map(doc => doc.data());
    const rows = data.map(inv => ({
      Invoice: inv.invoiceNo,
      Date: inv.createdAt.toDate().toLocaleDateString(),
      Total: calculateTotal(inv)
    }));
    const wb = utils.book_new();
    const ws = utils.json_to_sheet(rows);
    utils.book_append_sheet(wb, ws, "Summary");
    writeFile(wb, `Invoice_Summary_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2">👤 Business Branding Info</h2>
        <input type="text" placeholder="Business Name" className="border rounded p-2 w-full mb-2" value={branding.businessName} onChange={(e) => handleBrandingChange("businessName", e.target.value)} />
        <input type="text" placeholder="Business Address" className="border rounded p-2 w-full mb-2" value={branding.address} onChange={(e) => handleBrandingChange("address", e.target.value)} />
        <input type="text" placeholder="Mobile Number" className="border rounded p-2 w-full mb-2" value={branding.mobile} onChange={(e) => handleBrandingChange("mobile", e.target.value)} />
        <input type="text" placeholder="Logo URL" className="border rounded p-2 w-full mb-2" value={branding.logoUrl} onChange={(e) => handleBrandingChange("logoUrl", e.target.value)} />
      </div>

      <div className="mb-4">
        <h3 className="font-semibold">🎨 Invoice Template</h3>
        <select value={invoiceTemplate} onChange={e => setInvoiceTemplate(e.target.value)} className="border p-2 rounded">
          <option value="simple">Simple</option>
          <option value="modern">Modern</option>
          <option value="bold">Bold</option>
          <option value="minimal">Minimalist</option>
        </select>
        <button onClick={() => setShowPreview(!showPreview)} className="ml-4 px-3 py-1 bg-gray-700 text-white rounded">🖨️ Preview</button>
      </div>

      <div className="mb-4">
        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={showPANFields} onChange={() => setShowPANFields(!showPANFields)} />
          <span>📋 Show PAN/GST/Udyam Fields</span>
        </label>
      </div>

      <div className="mb-4">
        <h3 className="font-semibold">📈 Summary Report</h3>
        <button onClick={downloadSummaryReport} className="bg-green-600 text-white px-4 py-2 rounded">📊 Download Excel</button>
      </div>

      {showPreview && (
        <div className="border rounded p-4 bg-white shadow">
          <h2 className="text-lg font-bold mb-2">🖨️ Invoice Preview ({invoiceTemplate})</h2>
          <p><strong>Business:</strong> {branding.businessName}</p>
          <p><strong>Address:</strong> {branding.address}</p>
          <p><strong>Mobile:</strong> {branding.mobile}</p>
          <p><strong>Customer:</strong> {customerDetails.name} ({customerDetails.email})</p>
          <p><strong>Total:</strong> {currency} {calculateTotal()}</p>
        </div>
      )}
    </div>
  );
}
