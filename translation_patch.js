const fs = require('fs');

function addEcotrackDashboard(lang, filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  let jsonStr = '';
  if (lang === 'en') {
    jsonStr = `    ecotrackDashboard: {
      title: "Ecotrack Dashboard",
      subtitle: "Advanced analytics and business overview",
      filters: {
        allWilayas: "All Wilayas",
        allStatuses: "All Statuses",
        clear: "Clear filters",
        from: "From",
        to: "To",
        custom: "Custom",
        active: "Active filters:"
      },
      kpi: {
        orders: "Total Orders",
        delivered: "Delivered",
        returned: "Returned",
        successRate: "Success Rate",
        returnRate: "Return Rate",
        averageAmount: "Avg. Amount",
        amount: "Total Amount",
        netAmount: "Net Amount",
        serviceFees: "Service Fees",
        returnFees: "Return Fees",
      },
      trends: {
        title: "Performance Trends",
        orders: "Orders",
        delivered: "Delivered",
        returned: "Returned",
        amount: "Amount",
        fees: "Fees",
      },
      breakdowns: {
        outcomes: "Outcomes",
        statuses: "Statuses",
        orderTypes: "Order Types",
        deliveryModes: "Delivery Modes",
        products: "Top Products",
        productName: "Product",
        count: "Count",
        amount: "Amount",
        type_1: "Delivery",
        type_2: "Exchange",
        type_3: "Pickup",
        type_4: "Recovery",
        modeHome: "Home Delivery",
        modeStopDesk: "StopDesk",
      },
      map: {
        title: "Geographic Distribution",
        subtitle: "Performance by Wilaya",
        topWilayas: "Top Wilayas",
        hoverWilaya: "Wilaya",
        hoverTotal: "Total",
        hoverDelivered: "Delivered",
        hoverReturned: "Returned",
        hoverAmount: "Amount",
        hoverSuccess: "Success Rate",
        noData: "No data available",
      },
      recentOrders: {
        title: "Recent Orders",
        tracking: "Tracking",
        client: "Client",
        destination: "Destination",
        amount: "Amount",
        status: "Status",
        date: "Date",
        noData: "No recent orders",
      },
      error: {
        title: "Failed to load dashboard",
        desc: "An error occurred while fetching your data.",
        retry: "Try Again",
      },
      misc: {
        vsPrevious: "vs previous",
      }
    },`;
  } else if (lang === 'fr') {
    jsonStr = `    ecotrackDashboard: {
      title: "Tableau de bord",
      subtitle: "Analyses avancées et aperçu de l'activité",
      filters: {
        allWilayas: "Toutes les Wilayas",
        allStatuses: "Tous les Statuts",
        clear: "Effacer les filtres",
        from: "Du",
        to: "Au",
        custom: "Personnalisé",
        active: "Filtres actifs:"
      },
      kpi: {
        orders: "Total Commandes",
        delivered: "Livré",
        returned: "Retourné",
        successRate: "Taux de Succès",
        returnRate: "Taux de Retour",
        averageAmount: "Montant Moyen",
        amount: "Montant Total",
        netAmount: "Montant Net",
        serviceFees: "Frais de Service",
        returnFees: "Frais de Retour",
      },
      trends: {
        title: "Tendances des Performances",
        orders: "Commandes",
        delivered: "Livrées",
        returned: "Retournées",
        amount: "Montant",
        fees: "Frais",
      },
      breakdowns: {
        outcomes: "Résultats",
        statuses: "Statuts",
        orderTypes: "Types de Commandes",
        deliveryModes: "Modes de Livraison",
        products: "Top Produits",
        productName: "Produit",
        count: "Nombre",
        amount: "Montant",
        type_1: "Livraison",
        type_2: "Échange",
        type_3: "Ramassage",
        type_4: "Récupération",
        modeHome: "À Domicile",
        modeStopDesk: "StopDesk",
      },
      map: {
        title: "Distribution Géographique",
        subtitle: "Performances par Wilaya",
        topWilayas: "Top Wilayas",
        hoverWilaya: "Wilaya",
        hoverTotal: "Total",
        hoverDelivered: "Livré",
        hoverReturned: "Retourné",
        hoverAmount: "Montant",
        hoverSuccess: "Taux de succès",
        noData: "Aucune donnée disponible",
      },
      recentOrders: {
        title: "Commandes Récentes",
        tracking: "Suivi",
        client: "Client",
        destination: "Destination",
        amount: "Montant",
        status: "Statut",
        date: "Date",
        noData: "Aucune commande récente",
      },
      error: {
        title: "Échec du chargement",
        desc: "Une erreur s'est produite lors de la récupération de vos données.",
        retry: "Réessayer",
      },
      misc: {
        vsPrevious: "vs précédent",
      }
    },`;
  } else if (lang === 'ar') {
    jsonStr = `    ecotrackDashboard: {
      title: "لوحة التحكم",
      subtitle: "تحليلات متقدمة ونظرة عامة على النشاط",
      filters: {
        allWilayas: "كل الولايات",
        allStatuses: "كل الحالات",
        clear: "مسح الفلاتر",
        from: "من",
        to: "إلى",
        custom: "مخصص",
        active: "الفلاتر النشطة:"
      },
      kpi: {
        orders: "إجمالي الطلبات",
        delivered: "تم التوصيل",
        returned: "مرتجع",
        successRate: "نسبة النجاح",
        returnRate: "نسبة الإرجاع",
        averageAmount: "متوسط المبلغ",
        amount: "المبلغ الإجمالي",
        netAmount: "المبلغ الصافي",
        serviceFees: "رسوم الخدمة",
        returnFees: "رسوم الإرجاع",
      },
      trends: {
        title: "اتجاهات الأداء",
        orders: "الطلبات",
        delivered: "تم التوصيل",
        returned: "مرتجع",
        amount: "المبلغ",
        fees: "الرسوم",
      },
      breakdowns: {
        outcomes: "النتائج",
        statuses: "الحالات",
        orderTypes: "أنواع الطلبات",
        deliveryModes: "طرق التوصيل",
        products: "أفضل المنتجات",
        productName: "المنتج",
        count: "العدد",
        amount: "المبلغ",
        type_1: "توصيل",
        type_2: "استبدال",
        type_3: "استلام",
        type_4: "استرجاع",
        modeHome: "توصيل للمنزل",
        modeStopDesk: "نقطة توقف",
      },
      map: {
        title: "التوزيع الجغرافي",
        subtitle: "الأداء حسب الولاية",
        topWilayas: "أفضل الولايات",
        hoverWilaya: "الولاية",
        hoverTotal: "الإجمالي",
        hoverDelivered: "تم التوصيل",
        hoverReturned: "مرتجع",
        hoverAmount: "المبلغ",
        hoverSuccess: "نسبة النجاح",
        noData: "لا توجد بيانات متاحة",
      },
      recentOrders: {
        title: "الطلبات الحديثة",
        tracking: "رقم التتبع",
        client: "الزبون",
        destination: "الوجهة",
        amount: "المبلغ",
        status: "الحالة",
        date: "التاريخ",
        noData: "لا توجد طلبات حديثة",
      },
      error: {
        title: "فشل تحميل لوحة التحكم",
        desc: "حدث خطأ أثناء جلب البيانات.",
        retry: "إعادة المحاولة",
      },
      misc: {
        vsPrevious: "مقارنة بالسابق",
      }
    },`;
  }
  
  if (!content.includes('ecotrackDashboard: {')) {
    content = content.replace(/admin:\s*\{/, "admin: {\n" + jsonStr);
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${lang}`);
  } else {
    console.log(`${lang} already has ecotrackDashboard`);
  }
}

addEcotrackDashboard('en', 'artifacts/weasy-express/src/lib/locales/en.ts');
addEcotrackDashboard('fr', 'artifacts/weasy-express/src/lib/locales/fr.ts');
addEcotrackDashboard('ar', 'artifacts/weasy-express/src/lib/locales/ar.ts');
