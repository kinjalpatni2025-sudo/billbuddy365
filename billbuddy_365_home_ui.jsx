/* Full updated code with WhatsApp Invoice, Email, Templates, Dashboard Prep + PDF upload for WhatsApp */
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
  const [branding, setBranding] = useState({ businessName: "", logoUrl: "" });
  const [user, setUser] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [language, setLanguage] = useState("en");
  const [searchQuery, setSearchQuery] = useState("");
  const [customerDetails, setCustomerDetails] = useState({ name: "", address: "", phone: "", email: "" });
  const [invoiceNo, setInvoiceNo] = useState(1);
  const [currency, setCurrency] = useState("₹");
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

  const generateAndUploadPDF = async () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(branding.businessName || "Invoice", 14, 22);

    if (branding.logoUrl) {
      doc.addImage(branding.logoUrl, "JPEG", 150, 10, 40, 20);
    }

    doc.setFontSize(12);
    doc.text(`Invoice No: ${invoiceNo}`, 14, 30);
    doc.text(`Customer: ${customerDetails.name}`, 14, 37);
    doc.text(`Address: ${customerDetails.address}`, 14, 43);
    doc.text(`Phone: ${customerDetails.phone}`, 14, 49);
    doc.text(`Email: ${customerDetails.email}`, 14, 55);

    const tableColumn = ["Item Name", "Rate", "Qty", "Amount"];
    const tableRows = items.map(item => [
      item.name,
      item.rate,
      item.qty,
      (parseFloat(item.rate) * parseFloat(item.qty)).toFixed(2)
    ]);

    doc.autoTable({ head: [tableColumn], body: tableRows, startY: 62 });
    let y = doc.lastAutoTable.finalY + 10;
    doc.text(`Subtotal: ${currency}${calculateSubtotal().toFixed(2)}`, 14, y);
    y += 7;
    doc.text(`GST (${gst}%): ${currency}${((calculateSubtotal() * gst) / 100).toFixed(2)}`, 14, y);
    y += 7;
    doc.text(`Discount (${discount}%): ${currency}${((calculateSubtotal() * discount) / 100).toFixed(2)}`, 14, y);
    y += 7;
    doc.text(`Total: ${currency}${calculateTotal().toFixed(2)}`, 14, y);

    const pdfBlob = doc.output("blob");
    const storageRef = ref(storage, `invoices/invoice_${invoiceNo}.pdf`);
    await uploadBytes(storageRef, pdfBlob);
    return await getDownloadURL(storageRef);
  };

  const sendWhatsAppInvoice = async () => {
    const pdfUrl = await generateAndUploadPDF();
    const message = `Hi ${customerDetails.name}, your invoice #${invoiceNo} of total ${currency}${calculateTotal().toFixed(2)} is ready. Download here: ${pdfUrl}`;
    const phone = customerDetails.phone.replace(/^0/, "");
    const url = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const sendEmailInvoice = () => {
    generateAndUploadPDF();
    emailjs.send("YOUR_SERVICE_ID", "YOUR_TEMPLATE_ID", {
      to_email: customerDetails.email,
      to_name: customerDetails.name,
      message: `Please find attached your invoice #${invoiceNo}.`,
    }, "YOUR_USER_ID")
    .then(() => alert("Invoice sent successfully!"))
    .catch(() => alert("Failed to send invoice"));
  };

  const exportExcel = () => {
    const data = items.map(item => ({
      Item: item.name,
      Rate: item.rate,
      Quantity: item.qty,
      Amount: (parseFloat(item.rate) * parseFloat(item.qty)).toFixed(2)
    }));
    const wb = utils.book_new();
    const ws = utils.json_to_sheet(data);
    utils.book_append_sheet(wb, ws, "Invoice");
    writeFile(wb, `invoice_${invoiceNo}.xlsx`);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto" ref={printRef}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">🧾 Invoice Generator</h1>
        <div className="flex gap-2">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="border px-2 py-1 rounded-xl">
            <option value="en">English</option>
            <option value="gu">Gujarati</option>
            <option value="hi">Hindi</option>
          </select>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="border px-2 py-1 rounded-xl">
            <option value="₹">₹</option>
            <option value="$">$</option>
            <option value="€">€</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={sendEmailInvoice} className="bg-blue-500 text-white px-4 py-2 rounded-xl">📧 Email Invoice</button>
        <button onClick={sendWhatsAppInvoice} className="bg-green-500 text-white px-4 py-2 rounded-xl">📱 WhatsApp Invoice</button>
      </div>

      {/* Continue editing UI below */}
    </div>
  );
}
