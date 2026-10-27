import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Activity,
  Bell,
  Building2,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react-native";

import { auth } from "../../config/firebase";
import { COLORS } from "../../theme/colors";

export type DashboardRole = "employee" | "vendor" | "client";

type DashboardModule = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const DASHBOARD_MODULES: Record<DashboardRole, DashboardModule[]> = {
  employee: [
    {
      title: "Dashboard Overview",
      description: "Operations and performance",
      icon: LayoutDashboard,
    },
    {
      title: "Vendor Management",
      description: "Manage service partners",
      icon: Building2,
    },
    {
      title: "Client Management",
      description: "Healthcare facilities",
      icon: Users,
    },
    {
      title: "Contracts",
      description: "Coverage and renewals",
      icon: FileText,
    },
    {
      title: "Equipment",
      description: "Biomedical asset records",
      icon: Wrench,
    },
    {
      title: "Service Requests",
      description: "Tickets and work orders",
      icon: ClipboardList,
    },
    {
      title: "Purchase Orders",
      description: "Manage purchasing",
      icon: ShoppingCart,
    },
    {
      title: "Invoices",
      description: "Billing and payments",
      icon: Receipt,
    },
    {
      title: "Documents",
      description: "Service and contract files",
      icon: FolderOpen,
    },
    {
      title: "Approvals",
      description: "Pending account reviews",
      icon: ShieldCheck,
    },
  ],

  vendor: [
    {
      title: "Dashboard Overview",
      description: "Assigned work summary",
      icon: LayoutDashboard,
    },
    {
      title: "Assigned Contracts",
      description: "Contract responsibilities",
      icon: FileText,
    },
    {
      title: "Assigned Equipment",
      description: "Biomedical systems",
      icon: Wrench,
    },
    {
      title: "Work Orders",
      description: "Service assignments",
      icon: ClipboardList,
    },
    {
      title: "Service Schedule",
      description: "Upcoming maintenance",
      icon: CalendarClock,
    },
    {
      title: "Service Documents",
      description: "Reports and attachments",
      icon: FolderOpen,
    },
    {
      title: "Purchase Orders",
      description: "Assigned purchase orders",
      icon: ShoppingCart,
    },
    {
      title: "Invoices",
      description: "Vendor billing records",
      icon: Receipt,
    },
  ],

  client: [
    {
      title: "Dashboard Overview",
      description: "Facility overview",
      icon: LayoutDashboard,
    },
    {
      title: "My Contracts",
      description: "Service coverage details",
      icon: FileText,
    },
    {
      title: "My Equipment",
      description: "Registered biomedical assets",
      icon: Wrench,
    },
    {
      title: "Service Requests",
      description: "Request technical support",
      icon: ClipboardList,
    },
    {
      title: "Maintenance Schedule",
      description: "Upcoming service visits",
      icon: CalendarClock,
    },
    {
      title: "Service History",
      description: "Completed maintenance",
      icon: Activity,
    },
    {
      title: "Documents",
      description: "Reports and certificates",
      icon: FolderOpen,
    },
    {
      title: "Invoices",
      description: "Billing records",
      icon: Receipt,
    },
  ],
};

const DASHBOARD_INFO: Record<
  DashboardRole,
  {
    title: string;
    subtitle: string;
    welcome: string;
  }
> = {
  employee: {
    title: "Employee Dashboard",
    subtitle: "Nexus Operations Workspace",
    welcome:
      "Manage biomedical service operations, clients, vendors and contracts.",
  },
  vendor: {
    title: "Vendor Dashboard",
    subtitle: "Service Partner Workspace",
    welcome: "Manage your assigned service work, equipment and documentation.",
  },
  client: {
    title: "Client Dashboard",
    subtitle: "Healthcare Facility Workspace",
    welcome:
      "Manage your facility equipment, service requests and contract coverage.",
  },
};

export default function DashboardHome({ role }: { role: DashboardRole }) {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const info = DASHBOARD_INFO[role];
  const modules = DASHBOARD_MODULES[role];

  const isWide = width >= 800;

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/(auth)/login");
    } catch (error) {
      Alert.alert("Sign Out Error", "Unable to sign out. Please try again.");
    }
  };

  const openModule = (module: DashboardModule) => {
    Alert.alert(
      module.title,
      "This module will be connected to Firebase in the next development stage.",
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={require("../../../assets/images/nexus-logo.jpg")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Nexus Biomedical Services logo"
        />

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() =>
              Alert.alert(
                "Notifications",
                "Notifications will be available soon.",
              )
            }
          >
            <Bell size={20} color={COLORS.white} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerButton} onPress={handleLogout}>
            <LogOut size={20} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, isWide && styles.wideContent]}
      >
        {/* Page Heading */}
        <View style={styles.pageHeading}>
          <Text style={styles.pageSubtitle}>{info.subtitle}</Text>

          <Text style={styles.pageTitle}>{info.title}</Text>

          <Text style={styles.pageDescription}>
            Welcome to your Nexus Biomedical Services portal.
          </Text>
        </View>

        {/* Welcome Card */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeIcon}>
            <Activity size={24} color={COLORS.white} />
          </View>

          <Text style={styles.welcomeTitle}>Your Workspace</Text>

          <Text style={styles.welcomeDescription}>{info.welcome}</Text>

          <View style={styles.roleBadge}>
            <ShieldCheck size={15} color={COLORS.white} />
            <Text style={styles.roleBadgeText}>
              {role.toUpperCase()} ACCESS
            </Text>
          </View>
        </View>

        {/* Modules */}
        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Management Modules</Text>

            <Text style={styles.sectionSubtitle}>
              Select a module to continue
            </Text>
          </View>

          <Text style={styles.moduleCount}>{modules.length} Modules</Text>
        </View>

        <View style={styles.moduleGrid}>
          {modules.map((module) => {
            const Icon = module.icon;

            return (
              <TouchableOpacity
                key={module.title}
                style={[styles.moduleCard, isWide && styles.wideModuleCard]}
                activeOpacity={0.85}
                onPress={() => openModule(module)}
              >
                <View style={styles.moduleTop}>
                  <View style={styles.moduleIcon}>
                    <Icon size={23} color={COLORS.secondary} />
                  </View>

                  <ChevronRight size={19} color={COLORS.accent} />
                </View>

                <Text style={styles.moduleTitle}>{module.title}</Text>

                <Text style={styles.moduleDescription}>
                  {module.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <ShieldCheck size={16} color={COLORS.secondary} />

          <Text style={styles.footerText}>
            Nexus Biomedical Services • Secure Workspace
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  header: {
    height: 85,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  logo: {
    width: 175,
    height: 65,
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  headerButton: {
    width: 39,
    height: 39,
    backgroundColor: COLORS.secondary,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    padding: 18,
    paddingBottom: 35,
  },

  wideContent: {
    width: "100%",
    maxWidth: 1100,
    alignSelf: "center",
  },

  pageHeading: {
    marginBottom: 23,
  },

  pageSubtitle: {
    fontSize: 11,
    color: COLORS.secondary,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },

  pageTitle: {
    fontSize: 27,
    fontWeight: "900",
    color: COLORS.primary,
  },

  pageDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.muted,
    marginTop: 7,
  },

  welcomeCard: {
    backgroundColor: COLORS.secondary,
    borderRadius: 18,
    padding: 21,
    marginBottom: 28,
  },

  welcomeIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },

  welcomeTitle: {
    fontSize: 21,
    color: COLORS.white,
    fontWeight: "900",
  },

  welcomeDescription: {
    fontSize: 13,
    lineHeight: 21,
    color: "#F1E8FF",
    marginTop: 9,
    marginBottom: 18,
  },

  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    borderWidth: 1,
    borderColor: "#A88CFF",
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 20,
  },

  roleBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },

  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.primary,
  },

  sectionSubtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 5,
  },

  moduleCount: {
    fontSize: 11,
    color: COLORS.secondary,
    fontWeight: "800",
  },

  moduleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 13,
  },

  moduleCard: {
    width: "48%",
    backgroundColor: COLORS.surface,
    borderRadius: 15,
    padding: 15,
    minHeight: 165,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.primary,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },

  wideModuleCard: {
    width: "31.8%",
  },

  moduleTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 15,
  },

  moduleIcon: {
    width: 45,
    height: 45,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },

  moduleTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.primary,
  },

  moduleDescription: {
    fontSize: 11,
    lineHeight: 17,
    color: COLORS.muted,
    marginTop: 6,
  },

  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    marginTop: 30,
  },

  footerText: {
    fontSize: 11,
    color: COLORS.muted,
  },
});
