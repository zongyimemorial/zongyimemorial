import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import CustomerService from "@/components/site/CustomerService";

export default function PublicLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <CustomerService />
    </div>
  );
}
