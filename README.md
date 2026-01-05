# Visitor Counter

Visitor Counter is a lightweight, self-hosted web analytics tool — a privacy-friendly alternative to Google Analytics.  
It allows you to track visits, page views, and visitor locations across multiple websites, all from your own dashboard.

---

## 🛡️ GDPR Compliance

Visitor Counter is designed to be **GDPR-compliant**.  
It does **not** collect personally identifiable information (PII) and can work **without cookies**.  
All visitor data stays on your own server and can be fully anonymized.  

> ⚠️ Important: Always provide a short privacy notice on your site describing the data collected.

---

## ⚙️ Installation

```bash
# Clone the repository
git clone https://github.com/GLOXIOU/visitor-counter.git

# Go to the project directory
cd visitor-counter

# Install dependencies
npm install

# Start the server
node server.js

# Then open your browser and go to: (you can change the port in the .env file)
http://localhost:3000

```
---

## 🧩 Usage

1. On the homepage, create a **new tag** (you can create multiple for different websites).  
2. Give it a name — a **unique code** will be generated automatically.  
3. Copy the generated **HTML tracking snippet** and paste it inside the `<head>` section of your website’s code.  
4. Access your tag’s **Dashboard** to view visits, location stats, and other analytics.

> You can also integrate the tag into multiple pages using URL parameters to separate data by page.

---

## 🧱 Development Status

🚧 **This project is still under active development.**  
Expect improvements, UI updates, and new features soon.

---

## 🧑‍💻 Contributing

Pull requests and feature suggestions are welcome!  
Feel free to open an issue to discuss improvements.

---

## 🧾 License

© GLOXIOU 2026
