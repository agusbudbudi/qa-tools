import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  FileSpreadsheet,
  HandCoins,
  Menu,
  Package,
  Upload,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";

type DepositInfoRow = {
  clinicCode: string;
  userId: string;
  omnicareId: string;
  userName: string;
  phoneNumber: string;
  treatmentName: string;
  expirationDate: Date;
};

type RevenueClinicSummary = {
  clinicCode: string;
  treatmentRetailPrice: number;
  treatmentSellingPrice: number;
  treatmentDiscount: number;
  productRetailPrice: number;
  productSellingPrice: number;
  productDiscount: number;
  total: number;
};

type DepositPurchaseClinicSummary = {
  clinicCode: string;
  totalRetailPrice: number;
  totalSellingPrice: number;
  totalDiscount: number;
  total: number;
};

type MenuItem = {
  id:
    | "deposit-info"
    | "revenue-validation"
    | "deposit-purchase-validation"
    | "cashin-report-validation";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
};

type AnyRow = Record<string, unknown>;

const parseDate = (dateStr: unknown): Date | null => {
  if (typeof dateStr !== "string") return null;
  if (!dateStr) return null;
  const parts = dateStr.split(" ")[0]?.split("/");
  if (!parts || parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (
    !Number.isFinite(day) ||
    !Number.isFinite(month) ||
    !Number.isFinite(year)
  )
    return null;
  return new Date(year, month - 1, day);
};

const formatDate = (date: Date | null | undefined) => {
  if (!date) return "N/A";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

function amountFrom(row: AnyRow, key: string): number {
  const v = row[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    // Supports values like `Rp310.000`, `310.000`, `310000`
    // Keep only digits (treat as IDR without decimals)
    const digitsOnly = v.replace(/\D/g, "");
    if (!digitsOnly) return 0;
    const n = Number(digitsOnly);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

type CashInClinicSummary = {
  clinicCode: string;
  paymentMethodTotals: Record<string, number>;
  deposit: number;
  voucher: number;
  nonDepositVoucher: number;
  total: number;
};

function numberFrom(row: AnyRow, key: string): number {
  const v = row[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function stringFrom(row: AnyRow, key: string): string {
  const v = row[key];
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function lowerStringFrom(row: AnyRow, key: string): string {
  return stringFrom(row, key).toLowerCase();
}

function readFirstSheetAsJson(arrayBuffer: ArrayBuffer): AnyRow[] {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];
  // defval keeps missing cells defined (helps consistent parsing)
  return XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as AnyRow[];
}

function toDateInputValue(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromDateInputValue(value: string): Date | null {
  // value is expected as YYYY-MM-DD
  if (!value) return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const [yyyy, mm, dd] = parts;
  const year = Number(yyyy);
  const month = Number(mm);
  const day = Number(dd);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  const d = new Date(year, month - 1, day);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DepositManagementSystem: React.FC = () => {
  // Keep raw parsed rows, and derive the displayed rows from the selected date range.
  const [allDepositRows, setAllDepositRows] = useState<DepositInfoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<MenuItem["id"]>("deposit-info");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [depositStartDate, setDepositStartDate] = useState<string>(() =>
    toDateInputValue(new Date()),
  );

  const [revenueData, setRevenueData] = useState<RevenueClinicSummary[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [revenueError, setRevenueError] = useState("");

  const [depositPurchaseData, setDepositPurchaseData] = useState<
    DepositPurchaseClinicSummary[]
  >([]);
  const [depositPurchaseLoading, setDepositPurchaseLoading] = useState(false);
  const [depositPurchaseError, setDepositPurchaseError] = useState("");

  const [cashinData, setCashinData] = useState<CashInClinicSummary[]>([]);
  const [cashinLoading, setCashinLoading] = useState(false);
  const [cashinError, setCashinError] = useState("");

  const menuItems: MenuItem[] = [
    { id: "deposit-info", label: "Deposit Information", icon: FileSpreadsheet },
    {
      id: "revenue-validation",
      label: "Revenue Validation",
      icon: AlertCircle,
    },
    {
      id: "deposit-purchase-validation",
      label: "Deposit Purchase Validation",
      icon: Package,
    },
    {
      id: "cashin-report-validation",
      label: "Cash-In Report Validation",
      icon: HandCoins,
    },
  ];

  const depositDateRange = useMemo(() => {
    const start = fromDateInputValue(depositStartDate);
    if (!start) return null;
    const end = new Date(start);
    end.setMonth(end.getMonth() + 2);
    return { start, end };
  }, [depositStartDate]);

  const data = useMemo(() => {
    if (!depositDateRange) return [];
    const { start, end } = depositDateRange;
    return allDepositRows.filter(
      (row) => row.expirationDate >= start && row.expirationDate <= end,
    );
  }, [allDepositRows, depositDateRange]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = e.target?.result;
        if (!(buf instanceof ArrayBuffer))
          throw new Error("Invalid file buffer");
        const jsonData = readFirstSheetAsJson(buf);

        // Parse rows first; filtering will happen via the selected start date.
        const processedRows: DepositInfoRow[] = [];

        jsonData
          .filter((row) => numberFrom(row, "Remaining Quantity") > 0)
          .forEach((row) => {
            const clinicCode =
              stringFrom(row, "Deposit Purchase Clinic Code") || "Unknown";
            const userId = stringFrom(row, "User ID");
            const omnicareId =
              stringFrom(row, "Omnicare Id") ||
              stringFrom(row, "Omnicare ID") ||
              "";
            const userName = stringFrom(row, "Name");
            const phoneNumber = stringFrom(row, "Phone Number");
            const expirationDate = parseDate(row["Deposit Expiration Time"]);
            const treatmentName = stringFrom(row, "Treatment Display Name");

            if (!expirationDate || !userId) return;

            processedRows.push({
              clinicCode,
              userId,
              omnicareId,
              userName,
              phoneNumber,
              treatmentName,
              expirationDate,
            });
          });

        // Sort: clinic A-Z, then exp date asc
        processedRows.sort((a, b) => {
          const clinicCompare = a.clinicCode.localeCompare(b.clinicCode);
          if (clinicCompare !== 0) return clinicCompare;
          return a.expirationDate.getTime() - b.expirationDate.getTime();
        });

        setAllDepositRows(processedRows);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError(
          "Error processing file. Please ensure it's a valid Excel file with the correct format.",
        );
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError("Error reading file");
      setLoading(false);
    };

    reader.readAsArrayBuffer(file);
  };

  const handleRevenueUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setRevenueLoading(true);
    setRevenueError("");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = e.target?.result;
        if (!(buf instanceof ArrayBuffer))
          throw new Error("Invalid file buffer");
        const jsonData = readFirstSheetAsJson(buf);

        const clinicMap: Record<string, RevenueClinicSummary> = {};

        jsonData.forEach((row) => {
          const clinicCode = stringFrom(row, "Clinic Code") || "Unknown";
          const itemType = lowerStringFrom(row, "Purchase Item Type");
          const retailPrice = numberFrom(row, "Total Retail Price");
          const sellingPrice = numberFrom(row, "Total Selling Price");
          const discount = numberFrom(row, "Total Discount");
          const finalPrice = numberFrom(row, "Total Final Price");

          if (!clinicMap[clinicCode]) {
            clinicMap[clinicCode] = {
              clinicCode,
              treatmentRetailPrice: 0,
              treatmentSellingPrice: 0,
              treatmentDiscount: 0,
              productRetailPrice: 0,
              productSellingPrice: 0,
              productDiscount: 0,
              total: 0,
            };
          }

          if (itemType === "treatment") {
            clinicMap[clinicCode].treatmentRetailPrice += retailPrice;
            clinicMap[clinicCode].treatmentSellingPrice += sellingPrice;
            clinicMap[clinicCode].treatmentDiscount += discount;
          } else if (itemType === "product") {
            clinicMap[clinicCode].productRetailPrice += retailPrice;
            clinicMap[clinicCode].productSellingPrice += sellingPrice;
            clinicMap[clinicCode].productDiscount += discount;
          }

          clinicMap[clinicCode].total += finalPrice;
        });

        const processedData = Object.values(clinicMap).sort((a, b) =>
          a.clinicCode.localeCompare(b.clinicCode),
        );

        setRevenueData(processedData);
        setRevenueLoading(false);
      } catch (err) {
        console.error(err);
        setRevenueError(
          "Error processing file. Please ensure it's a valid Excel file with the correct format.",
        );
        setRevenueLoading(false);
      }
    };

    reader.onerror = () => {
      setRevenueError("Error reading file");
      setRevenueLoading(false);
    };

    reader.readAsArrayBuffer(file);
  };

  const totals = useMemo(() => {
    if (revenueData.length === 0) return null;
    return revenueData.reduce(
      (acc, clinic) => ({
        treatmentRetailPrice:
          acc.treatmentRetailPrice + clinic.treatmentRetailPrice,
        treatmentSellingPrice:
          acc.treatmentSellingPrice + clinic.treatmentSellingPrice,
        treatmentDiscount: acc.treatmentDiscount + clinic.treatmentDiscount,
        productRetailPrice: acc.productRetailPrice + clinic.productRetailPrice,
        productSellingPrice:
          acc.productSellingPrice + clinic.productSellingPrice,
        productDiscount: acc.productDiscount + clinic.productDiscount,
        total: acc.total + clinic.total,
      }),
      {
        treatmentRetailPrice: 0,
        treatmentSellingPrice: 0,
        treatmentDiscount: 0,
        productRetailPrice: 0,
        productSellingPrice: 0,
        productDiscount: 0,
        total: 0,
      },
    );
  }, [revenueData]);

  const handleDepositPurchaseUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDepositPurchaseLoading(true);
    setDepositPurchaseError("");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = e.target?.result;
        if (!(buf instanceof ArrayBuffer))
          throw new Error("Invalid file buffer");
        const jsonData = readFirstSheetAsJson(buf);

        const clinicMap: Record<string, DepositPurchaseClinicSummary> = {};

        jsonData.forEach((row) => {
          const clinicCode = stringFrom(row, "Clinic Code") || "Unknown";
          const retailPrice = numberFrom(row, "Total Retail Price");
          const sellingPrice = numberFrom(row, "Total Selling Price");
          const discount = numberFrom(row, "Total Discount");
          const finalPrice = numberFrom(row, "Total Final Price");

          if (!clinicMap[clinicCode]) {
            clinicMap[clinicCode] = {
              clinicCode,
              totalRetailPrice: 0,
              totalSellingPrice: 0,
              totalDiscount: 0,
              total: 0,
            };
          }

          clinicMap[clinicCode].totalRetailPrice += retailPrice;
          clinicMap[clinicCode].totalSellingPrice += sellingPrice;
          clinicMap[clinicCode].totalDiscount += discount;
          clinicMap[clinicCode].total += finalPrice;
        });

        const processedData = Object.values(clinicMap).sort((a, b) =>
          a.clinicCode.localeCompare(b.clinicCode),
        );
        setDepositPurchaseData(processedData);
        setDepositPurchaseLoading(false);
      } catch (err) {
        console.error(err);
        setDepositPurchaseError(
          "Error processing file. Please ensure it's a valid Excel file with the correct format.",
        );
        setDepositPurchaseLoading(false);
      }
    };

    reader.onerror = () => {
      setDepositPurchaseError("Error reading file");
      setDepositPurchaseLoading(false);
    };

    reader.readAsArrayBuffer(file);
  };

  const depositPurchaseTotals = useMemo(() => {
    if (depositPurchaseData.length === 0) return null;
    return depositPurchaseData.reduce(
      (acc, clinic) => ({
        totalRetailPrice: acc.totalRetailPrice + clinic.totalRetailPrice,
        totalSellingPrice: acc.totalSellingPrice + clinic.totalSellingPrice,
        totalDiscount: acc.totalDiscount + clinic.totalDiscount,
        total: acc.total + clinic.total,
      }),
      {
        totalRetailPrice: 0,
        totalSellingPrice: 0,
        totalDiscount: 0,
        total: 0,
      },
    );
  }, [depositPurchaseData]);

  const cashinTotals = useMemo(() => {
    if (cashinData.length === 0) return null;

    return cashinData.reduce(
      (acc, clinic) => {
        acc.nonDepositVoucher += clinic.nonDepositVoucher;
        acc.total += clinic.total;
        return acc;
      },
      { nonDepositVoucher: 0, total: 0 },
    );
  }, [cashinData]);

  const handleCashinUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCashinLoading(true);
    setCashinError("");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = e.target?.result;
        if (!(buf instanceof ArrayBuffer))
          throw new Error("Invalid file buffer");
        const jsonData = readFirstSheetAsJson(buf);

        const clinicMap: Record<string, CashInClinicSummary> = {};

        jsonData.forEach((row) => {
          const clinicCode = stringFrom(row, "Clinic Code") || "Unknown";
          const paymentMethod = stringFrom(row, "Payment Method") || "Unknown";
          const amount = amountFrom(row, "Amount");

          if (!clinicMap[clinicCode]) {
            clinicMap[clinicCode] = {
              clinicCode,
              paymentMethodTotals: {},
              deposit: 0,
              voucher: 0,
              nonDepositVoucher: 0,
              total: 0,
            };
          }

          clinicMap[clinicCode].paymentMethodTotals[paymentMethod] =
            (clinicMap[clinicCode].paymentMethodTotals[paymentMethod] || 0) +
            amount;

          clinicMap[clinicCode].total += amount;

          if (paymentMethod === "Treatment Deposit") {
            clinicMap[clinicCode].deposit += amount;
          }

          if (
            paymentMethod === "Clinic Voucher - Value" ||
            paymentMethod === "Clinic Voucher - Treatment"
          ) {
            clinicMap[clinicCode].voucher += amount;
          }
        });

        const processedData = Object.values(clinicMap)
          .map((clinic) => {
            const nonDepositVoucher =
              clinic.total - clinic.deposit - clinic.voucher;
            return { ...clinic, nonDepositVoucher };
          })
          .sort((a, b) => a.clinicCode.localeCompare(b.clinicCode));

        setCashinData(processedData);
        setCashinLoading(false);
      } catch (err) {
        console.error(err);
        setCashinError(
          "Error processing file. Please ensure it's a valid Cash-In Excel file with the correct format.",
        );
        setCashinLoading(false);
      }
    };

    reader.onerror = () => {
      setCashinError("Error reading file");
      setCashinLoading(false);
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? "w-64" : "w-0"} transition-all duration-300 bg-indigo-900 text-white overflow-hidden`}
      >
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <Package className="w-8 h-8" />
            <h1 className="text-xl font-bold">Deposit Manager</h1>
          </div>

          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => !item.disabled && setActiveTab(item.id)}
                  disabled={item.disabled}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === item.id
                      ? "bg-indigo-700"
                      : item.disabled
                        ? "bg-indigo-800 opacity-50 cursor-not-allowed"
                        : "hover:bg-indigo-800"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                  {item.disabled && (
                    <span className="ml-auto text-xs bg-indigo-700 px-2 py-1 rounded">
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white shadow-sm p-4 flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {sidebarOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
          <h2 className="text-2xl font-bold text-gray-800">
            {menuItems.find((item) => item.id === activeTab)?.label}
          </h2>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === "deposit-info" && (
            <div className="max-w-7xl mx-auto">
              {/* Upload Section */}
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Upload Excel File
                </h3>

                {/* Date Range */}
                <div className="mb-4 flex flex-col sm:flex-row sm:items-end gap-3">
                  <div>
                    <label
                      htmlFor="deposit-start-date"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Start date
                    </label>
                    <input
                      id="deposit-start-date"
                      type="date"
                      value={depositStartDate}
                      onChange={(e) => setDepositStartDate(e.target.value)}
                      className="mt-1 w-48 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="text-sm text-gray-600">
                    Range:{" "}
                    <span className="font-medium text-gray-800">
                      {depositDateRange
                        ? `${formatDate(depositDateRange.start)} – ${formatDate(depositDateRange.end)}`
                        : "N/A"}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      (2 months)
                    </span>
                  </div>
                </div>

                <div className="border-2 border-dashed border-indigo-300 rounded-lg p-8 text-center hover:border-indigo-500 transition-colors">
                  <Upload className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <span className="text-indigo-600 font-semibold hover:text-indigo-700">
                      Click to upload Excel file
                    </span>
                    <input
                      id="file-upload"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-gray-500 text-sm mt-2">
                    Supports .xlsx and .xls files
                  </p>
                </div>

                {error && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                  </div>
                )}

                {loading && (
                  <div className="mt-4 text-center text-indigo-600 font-semibold">
                    Processing file...
                  </div>
                )}
              </div>

              {/* Statistics */}
              {data.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-gray-500 text-sm">
                      Expiring Deposits (Next 2 Months)
                    </p>
                    <p className="text-3xl font-bold text-indigo-600">
                      {data.length}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-gray-500 text-sm">Unique Clinics</p>
                    <p className="text-3xl font-bold text-green-600">
                      {new Set(data.map((d) => d.clinicCode)).size}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-gray-500 text-sm">Unique Users</p>
                    <p className="text-3xl font-bold text-purple-600">
                      {new Set(data.map((d) => d.userId)).size}
                    </p>
                  </div>
                </div>
              )}

              {/* Data Table */}
              {data.length > 0 && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-indigo-600 text-white">
                        <tr>
                          <th className="px-6 py-4 text-left font-semibold w-32">
                            Clinic Code
                          </th>
                          <th className="px-6 py-4 text-left font-semibold">
                            User
                          </th>
                          <th className="px-6 py-4 text-left font-semibold">
                            Expiring Deposit
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((item, index) => (
                          <tr
                            key={`${item.userId}-${index}`}
                            className={`border-b hover:bg-indigo-50 transition-colors ${
                              index % 2 === 0 ? "bg-gray-50" : "bg-white"
                            }`}
                          >
                            <td className="px-6 py-4 font-semibold text-indigo-700">
                              {item.clinicCode}
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-1">
                                <div className="font-medium text-gray-800">
                                  [{item.omnicareId}]
                                </div>
                                <div className="text-gray-800">
                                  {item.userName}
                                </div>
                                <div className="text-sm text-gray-600">
                                  {item.phoneNumber}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div>
                                <div className="font-medium text-gray-800">
                                  {item.treatmentName}
                                </div>
                                <div className="text-sm text-gray-600">
                                  {formatDate(item.expirationDate)}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!loading && data.length === 0 && !error && (
                <div className="bg-white rounded-lg shadow-md p-12 text-center">
                  <FileSpreadsheet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">
                    Upload an Excel file to view deposit information
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "revenue-validation" && (
            <div className="max-w-7xl mx-auto">
              {/* Upload Section */}
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Upload Revenue Excel File
                </h3>
                <div className="border-2 border-dashed border-indigo-300 rounded-lg p-8 text-center hover:border-indigo-500 transition-colors">
                  <Upload className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
                  <label
                    htmlFor="revenue-file-upload"
                    className="cursor-pointer"
                  >
                    <span className="text-indigo-600 font-semibold hover:text-indigo-700">
                      Click to upload Revenue Excel file
                    </span>
                    <input
                      id="revenue-file-upload"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleRevenueUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-gray-500 text-sm mt-2">
                    Supports .xlsx and .xls files
                  </p>
                </div>

                {revenueError && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {revenueError}
                  </div>
                )}

                {revenueLoading && (
                  <div className="mt-4 text-center text-indigo-600 font-semibold">
                    Processing file...
                  </div>
                )}
              </div>

              {/* Revenue Data Table */}
              {revenueData.length > 0 && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-indigo-600 text-white">
                        <tr>
                          <th className="px-6 py-4 text-left font-semibold">
                            Clinic Code
                          </th>
                          <th className="px-6 py-4 text-left font-semibold">
                            Summary Detail
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenueData.map((clinic, index) => (
                          <tr
                            key={`${clinic.clinicCode}-${index}`}
                            className={`border-b hover:bg-indigo-50 transition-colors ${
                              index % 2 === 0 ? "bg-gray-50" : "bg-white"
                            }`}
                          >
                            <td className="px-6 py-4 font-semibold text-indigo-700 align-top">
                              {clinic.clinicCode}
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Treatment Retail Price:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(
                                      clinic.treatmentRetailPrice,
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Treatment Selling Price:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(
                                      clinic.treatmentSellingPrice,
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Treatment Discount:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(clinic.treatmentDiscount)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Product Retail Price:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(clinic.productRetailPrice)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Product Selling Price:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(clinic.productSellingPrice)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Product Discount:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(clinic.productDiscount)}
                                  </span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-gray-300">
                                  <span className="font-bold text-gray-800">
                                    Total:
                                  </span>
                                  <span className="font-bold text-indigo-700">
                                    {formatCurrency(clinic.total)}
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}

                        {/* Total Row */}
                        {totals && (
                          <tr className="bg-indigo-100 border-t-2 border-indigo-600 font-semibold">
                            <td className="px-6 py-4 text-indigo-900 align-top text-lg">
                              TOTAL
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Treatment Retail Price:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(
                                      totals.treatmentRetailPrice,
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Treatment Selling Price:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(
                                      totals.treatmentSellingPrice,
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Treatment Discount:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(totals.treatmentDiscount)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Product Retail Price:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(totals.productRetailPrice)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Product Selling Price:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(totals.productSellingPrice)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Product Discount:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(totals.productDiscount)}
                                  </span>
                                </div>

                                <div className="flex justify-between pt-2 border-t-2 border-indigo-600">
                                  <span className="font-bold text-indigo-900">
                                    Total (Checksum 1):
                                  </span>
                                  <span className="font-bold text-indigo-900 text-lg">
                                    {formatCurrency(totals.total)}
                                  </span>
                                </div>

                                <div className="mt-2 pt-2 border-t border-gray-300 space-y-1">
                                  <div className="flex justify-between text-xs text-gray-600">
                                    <span>Checksum 2:</span>
                                    <span>
                                      {formatCurrency(
                                        totals.treatmentSellingPrice +
                                          totals.productSellingPrice -
                                          totals.treatmentDiscount -
                                          totals.productDiscount,
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-sm font-bold pt-1">
                                    <span>Validation:</span>
                                    <span
                                      className={`px-2 py-1 rounded ${
                                        Math.abs(
                                          totals.total -
                                            (totals.treatmentSellingPrice +
                                              totals.productSellingPrice -
                                              totals.treatmentDiscount -
                                              totals.productDiscount),
                                        ) < 0.01
                                          ? "bg-green-100 text-green-800"
                                          : "bg-red-100 text-red-800"
                                      }`}
                                    >
                                      {Math.abs(
                                        totals.total -
                                          (totals.treatmentSellingPrice +
                                            totals.productSellingPrice -
                                            totals.treatmentDiscount -
                                            totals.productDiscount),
                                      ) < 0.01
                                        ? "PASS"
                                        : "FAIL"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!revenueLoading && revenueData.length === 0 && !revenueError && (
                <div className="bg-white rounded-lg shadow-md p-12 text-center">
                  <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">
                    Upload a revenue Excel file to validate data
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "deposit-purchase-validation" && (
            <div className="max-w-7xl mx-auto">
              {/* Upload Section */}
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Upload Deposit Purchase Excel File
                </h3>
                <div className="border-2 border-dashed border-indigo-300 rounded-lg p-8 text-center hover:border-indigo-500 transition-colors">
                  <Upload className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
                  <label
                    htmlFor="deposit-purchase-file-upload"
                    className="cursor-pointer"
                  >
                    <span className="text-indigo-600 font-semibold hover:text-indigo-700">
                      Click to upload Deposit Purchase Excel file
                    </span>
                    <input
                      id="deposit-purchase-file-upload"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleDepositPurchaseUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-gray-500 text-sm mt-2">
                    Supports .xlsx and .xls files
                  </p>
                </div>

                {depositPurchaseError && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {depositPurchaseError}
                  </div>
                )}

                {depositPurchaseLoading && (
                  <div className="mt-4 text-center text-indigo-600 font-semibold">
                    Processing file...
                  </div>
                )}
              </div>

              {/* Deposit Purchase Data Table */}
              {depositPurchaseData.length > 0 && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-indigo-600 text-white">
                        <tr>
                          <th className="px-6 py-4 text-left font-semibold">
                            Clinic Code
                          </th>
                          <th className="px-6 py-4 text-left font-semibold">
                            Summary Detail
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {depositPurchaseData.map((clinic, index) => (
                          <tr
                            key={`${clinic.clinicCode}-${index}`}
                            className={`border-b hover:bg-indigo-50 transition-colors ${
                              index % 2 === 0 ? "bg-gray-50" : "bg-white"
                            }`}
                          >
                            <td className="px-6 py-4 font-semibold text-indigo-700 align-top">
                              {clinic.clinicCode}
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Total Retail Price:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(clinic.totalRetailPrice)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Total Selling Price:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(clinic.totalSellingPrice)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Total Discount:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(clinic.totalDiscount)}
                                  </span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-gray-300">
                                  <span className="font-bold text-gray-800">
                                    Total:
                                  </span>
                                  <span className="font-bold text-indigo-700">
                                    {formatCurrency(clinic.total)}
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}

                        {/* Total Row */}
                        {depositPurchaseTotals && (
                          <tr className="bg-indigo-100 border-t-2 border-indigo-600 font-semibold">
                            <td className="px-6 py-4 text-indigo-900 align-top text-lg">
                              TOTAL
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Total Retail Price:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(
                                      depositPurchaseTotals.totalRetailPrice,
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Total Selling Price:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(
                                      depositPurchaseTotals.totalSellingPrice,
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-medium text-gray-700">
                                    Total Discount:
                                  </span>
                                  <span className="text-gray-900">
                                    {formatCurrency(
                                      depositPurchaseTotals.totalDiscount,
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between pt-2 border-t-2 border-indigo-600">
                                  <span className="font-bold text-indigo-900">
                                    Total:
                                  </span>
                                  <span className="font-bold text-indigo-900 text-lg">
                                    {formatCurrency(
                                      depositPurchaseTotals.total,
                                    )}
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!depositPurchaseLoading &&
                depositPurchaseData.length === 0 &&
                !depositPurchaseError && (
                  <div className="bg-white rounded-lg shadow-md p-12 text-center">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">
                      Upload a deposit purchase Excel file to validate data
                    </p>
                  </div>
                )}
            </div>
          )}

          {activeTab === "cashin-report-validation" && (
            <div className="max-w-7xl mx-auto">
              {/* Upload Section */}
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Upload Cash-In Report Excel File
                </h3>
                <div className="border-2 border-dashed border-indigo-300 rounded-lg p-8 text-center hover:border-indigo-500 transition-colors">
                  <Upload className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
                  <label
                    htmlFor="cashin-file-upload"
                    className="cursor-pointer"
                  >
                    <span className="text-indigo-600 font-semibold hover:text-indigo-700">
                      Click to upload Cash-In Excel file
                    </span>
                    <input
                      id="cashin-file-upload"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleCashinUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-gray-500 text-sm mt-2">
                    Supports .xlsx and .xls files
                  </p>
                </div>

                {cashinError && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {cashinError}
                  </div>
                )}

                {cashinLoading && (
                  <div className="mt-4 text-center text-indigo-600 font-semibold">
                    Processing file...
                  </div>
                )}
              </div>

              {/* Cash-In Summary Table */}
              {cashinData.length > 0 && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-indigo-600 text-white">
                        <tr>
                          <th className="px-6 py-4 text-left font-semibold w-40">
                            Clinic Code
                          </th>
                          <th className="px-6 py-4 text-left font-semibold">
                            Details
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {cashinData.map((clinic, index) => {
                          const methods = Object.entries(
                            clinic.paymentMethodTotals,
                          ).sort((a, b) => a[0].localeCompare(b[0]));

                          return (
                            <tr
                              key={`${clinic.clinicCode}-${index}`}
                              className={`border-b hover:bg-indigo-50 transition-colors ${
                                index % 2 === 0 ? "bg-gray-50" : "bg-white"
                              }`}
                            >
                              <td className="px-6 py-4 font-semibold text-indigo-700 align-top">
                                {clinic.clinicCode}
                              </td>
                              <td className="px-6 py-4 align-top">
                                <div className="space-y-1 text-sm">
                                  {methods.map(([method, amt]) => (
                                    <div
                                      key={method}
                                      className="flex justify-between gap-6"
                                    >
                                      <span className="font-medium text-gray-700">
                                        {method}:
                                      </span>
                                      <span className="text-gray-900 tabular-nums">
                                        {formatCurrency(amt)}
                                      </span>
                                    </div>
                                  ))}

                                  <div className="pt-2 mt-2 border-t border-gray-300 space-y-1">
                                    <div className="flex justify-between gap-6">
                                      <span className="font-medium text-gray-700">
                                        Deposit:
                                      </span>
                                      <span className="text-gray-900 tabular-nums">
                                        {formatCurrency(clinic.deposit)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between gap-6">
                                      <span className="font-medium text-gray-700">
                                        Voucher:
                                      </span>
                                      <span className="text-gray-900 tabular-nums">
                                        {formatCurrency(clinic.voucher)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between gap-6">
                                      <span className="font-bold text-gray-800">
                                        Total non deposit and voucher:
                                      </span>
                                      <span className="font-bold text-gray-900 tabular-nums">
                                        {formatCurrency(
                                          clinic.nonDepositVoucher,
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex justify-between gap-6">
                                      <span className="font-bold text-indigo-900">
                                        Total:
                                      </span>
                                      <span className="font-bold text-indigo-900 tabular-nums">
                                        {formatCurrency(clinic.total)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {/* Total Row */}
                        {cashinTotals && (
                          <tr className="bg-indigo-100 border-t-2 border-indigo-600 font-semibold">
                            <td className="px-6 py-4 text-indigo-900 align-top text-lg">
                              TOTAL
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between gap-6">
                                  <span className="font-bold text-gray-800">
                                    Total non deposit and voucher:
                                  </span>
                                  <span className="font-bold text-gray-900 tabular-nums">
                                    {formatCurrency(
                                      cashinTotals.nonDepositVoucher,
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-6">
                                  <span className="font-bold text-indigo-900">
                                    Total:
                                  </span>
                                  <span className="font-bold text-indigo-900 tabular-nums">
                                    {formatCurrency(cashinTotals.total)}
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!cashinLoading && cashinData.length === 0 && !cashinError && (
                <div className="bg-white rounded-lg shadow-md p-12 text-center">
                  <HandCoins className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">
                    Upload a Cash-In report Excel file to view summary
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DepositManagementSystem;
