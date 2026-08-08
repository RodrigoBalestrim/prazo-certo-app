import { CameraView, useCameraPermissions } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { dateToIso, daysUntil, expiryLabel, formatBrazilianDate, maskBrazilianDate, parseBrazilianDate } from "@/date";
import { cancelNotifications, NotificationPreferences, prepareNotifications, scheduleExpiryNotifications } from "@/notifications";
import { lookupProduct } from "@/productLookup";
import { contributeCatalogProduct } from "@/productCatalog";
import { loadProducts, saveProducts } from "@/storage";
import { PRODUCT_CATEGORIES, Product, ProductCategory } from "@/types";
import { BarcodeIcon } from "@/components/BarcodeIcon";
import { AuthScreen } from "@/components/AuthScreen";
import { CompanyScreen } from "@/components/CompanyScreen";
import { CompanyManagerModal } from "@/components/CompanyManagerModal";
import { HistoryScreen } from "@/components/HistoryScreen";
import { deleteCloudProducts, loadCloudArchivedProducts, loadCloudProducts, replaceCloudProducts } from "@/cloudStorage";
import { CompanyMembership, canAddProducts, canDeleteProducts, canManageCompany, loadMyCompany } from "@/company";
import { analyzeProductWithAi, existingProductNames, recordImageHistory } from "@/aiProduct";
import { compressImageForUpload } from "@/imageUtils";
import { supabase } from "@/supabase";
import { uploadAvatar } from "@/avatar";

export default function HomeScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [company, setCompany] = useState<CompanyMembership | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerFieldOnly, setScannerFieldOnly] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [barcode, setBarcode] = useState("");
  const [expiry, setExpiry] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [category, setCategory] = useState<ProductCategory>("Mercearia");
  const [notes, setNotes] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [packagingType, setPackagingType] = useState("");
  const [cutoutUrl, setCutoutUrl] = useState("");
  const [photoOriginal, setPhotoOriginal] = useState("");
  const [aiProcessing, setAiProcessing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);
  const [removingSelected, setRemovingSelected] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionProduct, setActionProduct] = useState<Product | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [companyManagerOpen, setCompanyManagerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [companySetupOpen, setCompanySetupOpen] = useState(false);
  const [companySetupMode, setCompanySetupMode] = useState<"create" | "join">("create");
  const [menuScreen, setMenuScreen] = useState<"profile" | "notifications" | "reports" | "help" | null>(null);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profilePhotoDraft, setProfilePhotoDraft] = useState("");
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    enabled: true,
    advance: true,
    sevenDays: true,
    oneDay: true,
    expiryDay: true,
  });
  const [permission, requestPermission] = useCameraPermissions();
  const isDemo = session?.user.id === "demo-user";
  const role = company?.role;
  const rolePermissions = {
    canAdd: canAddProducts(role),
    canDelete: canDeleteProducts(role),
    canManage: canManageCompany(role),
  };

  const profileName =
    session?.user.user_metadata?.full_name ||
    session?.user.user_metadata?.name ||
    session?.user.email?.split("@")[0] ||
    "Usuário";
  const profilePhoto =
    session?.user.user_metadata?.avatar_url ||
    session?.user.user_metadata?.picture ||
    "";

  useEffect(() => {
    if (!session?.user.id) return;
    AsyncStorage.getItem(`@prazo-certo/notifications/${session.user.id}`)
      .then((raw) => {
        if (raw) setNotificationPreferences(JSON.parse(raw) as NotificationPreferences);
      })
      .catch(() => undefined);
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id || !session.user.email || isDemo) return;
    const key = `@prazo-certo/pending-avatar/${session.user.email.toLowerCase()}`;
    AsyncStorage.getItem(key)
      .then(async (pendingPhoto) => {
        if (!pendingPhoto) return;
        await uploadAvatar(session.user.id, pendingPhoto);
        await AsyncStorage.removeItem(key);
      })
      .catch(() => undefined);
  }, [session?.user.id, session?.user.email, isDemo]);

  useEffect(() => {
    prepareNotifications().catch(() => undefined);
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user.id) {
      setCompany(null);
      setCompanyLoading(false);
      return;
    }
    if (session.user.id === "demo-user") {
      setCompany(null);
      setCompanyLoading(false);
      return;
    }

    let active = true;
    setCompanyLoading(true);
    loadMyCompany()
      .then((value) => {
        if (active) setCompany(value);
      })
      .catch(() => {
        if (active) {
          setCompany(null);
          Alert.alert(
            "Configuração do grupo pendente",
            "Atualize o banco de dados do Supabase para ativar os grupos de lista.",
          );
        }
      })
      .finally(() => {
        if (active) setCompanyLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) {
      setProducts([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    (async () => {
      if (session.user.id === "demo-user") {
        const storedDemoProducts = await loadProducts("demo-user/personal");
        const demoProducts = await buildTestProducts(storedDemoProducts);
        await saveProducts(demoProducts, "demo-user/personal");
        if (active) setProducts(demoProducts);
        if (active) setLoading(false);
        return;
      }
      try {
        const scopeKey = `${session.user.id}/${company?.id ?? "personal"}`;
        const remoteProducts = await loadCloudProducts(company?.id ?? null, session.user.id);
        if (!active) return;
        if (remoteProducts.length) {
          setProducts(remoteProducts);
          await saveProducts(remoteProducts, scopeKey);
          return;
        }

        const cachedProducts = await loadProducts(scopeKey);
        const legacyProducts = !company
          ? (cachedProducts.length ? cachedProducts : await loadProducts(session.user.id))
          : cachedProducts;
        setProducts(legacyProducts);
        if (legacyProducts.length && !company) {
          await replaceCloudProducts(session.user.id, null, legacyProducts);
          await saveProducts(legacyProducts, scopeKey);
        }
      } catch {
        const scopeKey = `${session.user.id}/${company?.id ?? "personal"}`;
        const cachedProducts = await loadProducts(scopeKey);
        if (active) {
          setProducts(cachedProducts);
          Alert.alert(
            "Sincronização pendente",
            "Não foi possível acessar o banco online. Seus produtos continuarão salvos neste celular.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [session?.user.id, company?.id]);

  useEffect(() => {
    if (!session?.user.id || isDemo) return;

    const channel = supabase
      .channel(`products-${company?.id ?? `personal-${session.user.id}`}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: company?.id
            ? `organization_id=eq.${company.id}`
            : `user_id=eq.${session.user.id}`,
        },
        async () => {
          try {
            const latest = await loadCloudProducts(company?.id ?? null, session.user.id);
            setProducts(latest);
            await saveProducts(latest, `${session.user.id}/${company?.id ?? "personal"}`);
          } catch {
            // Mantém a lista atual quando a atualização em tempo real falhar.
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user.id, company?.id, isDemo]);

  const sorted = useMemo(
    () => [...products].filter((product) => !product.archived).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)),
    [products],
  );
  const stats = useMemo(() => {
    const expired = products.filter((item) => daysUntil(item.expiresAt) < 0).length;
    const expiring = products.filter((item) => {
      const days = daysUntil(item.expiresAt);
      return days >= 0 && days <= 7;
    }).length;
    return { expired, expiring, ok: products.length - expired - expiring };
  }, [products]);
  const totalUnits = useMemo(
    () => products.reduce((total, product) => total + product.quantity, 0),
    [products],
  );

  function openMenuScreen(screen: "profile" | "notifications" | "reports" | "help") {
    setProfileMenuOpen(false);
    if (screen === "profile") {
      setProfileNameDraft(profileName);
      setProfilePhotoDraft(profilePhoto);
    }
    setMenuScreen(screen);
  }

  async function chooseProfilePhoto() {
    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permissão necessária", "Permita o acesso às fotos para escolher uma imagem.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setProfilePhotoDraft(
        asset.base64
          ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
          : asset.uri,
      );
    }
  }

  async function chooseProductPhoto() {
    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permissão necessária", "Permita o acesso às fotos para escolher uma imagem.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.base64
        ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
        : asset.uri;
      compressImageForUpload(uri).then((compressed) => {
        setImageUrl(compressed);
        setPhotoOriginal(compressed);
      });
      setCutoutUrl("");
    }
  }

  async function saveProfile() {
    let avatarUrl = profilePhotoDraft.trim();
    if (
      !isDemo &&
      session?.user.id &&
      /^(data:|file:|blob:)/.test(avatarUrl)
    ) {
      try {
        avatarUrl = await uploadAvatar(session.user.id, avatarUrl);
      } catch (error) {
        Alert.alert(
          "Não foi possível enviar a foto",
          error instanceof Error ? error.message : "Tente novamente.",
        );
        return;
      }
    }
    const metadata = {
      ...session?.user.user_metadata,
      full_name: profileName,
      avatar_url: avatarUrl,
    };
    if (isDemo && session) {
      setSession({ ...session, user: { ...session.user, user_metadata: metadata } });
    } else {
      const { error } = await supabase.auth.updateUser({ data: metadata });
      if (error) {
        Alert.alert("Não foi possível salvar", error.message);
        return;
      }
    }
    setMenuScreen(null);
    Alert.alert("Perfil atualizado", "Suas informações foram salvas.");
  }

  async function saveNotificationPreferences() {
    if (!session?.user.id) return;
    await AsyncStorage.setItem(
      `@prazo-certo/notifications/${session.user.id}`,
      JSON.stringify(notificationPreferences),
    );
    setMenuScreen(null);
    Alert.alert(
      "Notificações atualizadas",
      "As preferências serão usadas nos próximos produtos cadastrados.",
    );
  }

  async function persist(next: Product[]) {
    setProducts(next);
    if (!session?.user.id) return;
    await saveProducts(next, `${session.user.id}/${company?.id ?? "personal"}`);
    if (isDemo) return;
    try {
      await replaceCloudProducts(session.user.id, company?.id ?? null, next);
    } catch {
      Alert.alert(
        "Produto salvo no celular",
        "A sincronização online não foi concluída. Verifique sua internet e tente novamente.",
      );
    }
  }

  async function archiveExpiredProducts() {
    const now = new Date();
    const next = products.map((product) => {
      if (product.archived) return product;
      const expiresAt = new Date(`${product.expiresAt}T00:00:00`);
      const daysAfterExpiry = Math.floor((now.getTime() - expiresAt.getTime()) / 86400000);
      return daysAfterExpiry > 4
        ? { ...product, archived: true, archivedAt: now.toISOString() }
        : product;
    });
    if (next.some((product, index) => product !== products[index])) await persist(next);
  }

  useEffect(() => {
    if (!products.length || loading) return;
    archiveExpiredProducts().catch(() => undefined);
  }, [products.length, loading]);

  function resetForm() {
    setName("");
    setImageUrl("");
    setBarcode("");
    setExpiry("");
    setQuantity("1");
    setCategory("Mercearia");
    setNotes("");
    setBrand("");
    setDescription("");
    setPackagingType("");
    setCutoutUrl("");
    setPhotoOriginal("");
    setEditingId(null);
  }

  async function openScanner() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert("Câmera necessária", "Libere a câmera para ler o código de barras.");
        return;
      }
    }
    setScannerFieldOnly(false);
    setScannerOpen(true);
  }

  // Abre a câmera a partir do campo "Código de barras" do formulário:
  // ao escanear, apenas preenche o campo sem abrir o fluxo completo.
  async function openFieldScanner() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert("Câmera necessária", "Libere a câmera para ler o código de barras.");
        return;
      }
    }
    setScannerFieldOnly(true);
    setScannerOpen(true);
  }

  function onFieldBarcodeScanned(value: string) {
    setScannerOpen(false);
    setScannerFieldOnly(false);
    setBarcode(value);
  }

  async function onBarcodeScanned(value: string) {
    setScannerOpen(false);
    setBarcode(value);

    const existing = products.find((item) => item.barcode === value && !item.archived);
    if (existing) {
      Alert.alert("Produto já cadastrado", `${existing.name} já está na sua lista.`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Editar", onPress: () => editProduct(existing) },
      ]);
      return;
    }

    setFormOpen(true);
    setLookingUp(true);
    const foundProduct = await lookupProduct(value);
    if (foundProduct?.name) setName(foundProduct.name);
    if (foundProduct?.imageUrl) setImageUrl(foundProduct.imageUrl);
    if (foundProduct?.category) setCategory(foundProduct.category);

    if (!foundProduct?.name && !foundProduct?.imageUrl) {
      setFormOpen(false);
      Alert.alert(
        "Produto não encontrado",
        "O código foi lido, mas o produto não está na base. Cadastre por foto com IA ou digite os dados manualmente.",
        [
          { text: "Digitar manualmente", style: "cancel", onPress: () => setFormOpen(true) },
          { text: "Cadastrar com IA", onPress: () => startAiPhoto(value) },
        ],
      );
    }
    setLookingUp(false);
  }

  async function startAiPhoto(code?: string) {
    if (Platform.OS === "web") {
      await choosePhotoForAi(code);
      return;
    }
    Alert.alert("Cadastro por IA", "Tire uma foto do produto ou escolha da galeria.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Galeria", onPress: () => choosePhotoForAi(code) },
      { text: "Tirar foto", onPress: () => takePhotoForAi(code) },
    ]);
  }

  async function choosePhotoForAi(code?: string) {
    if (Platform.OS !== "web") {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permissão necessária", "Permita o acesso às fotos para usar o cadastro por IA.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const uri = asset.base64
      ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
      : asset.uri;
    await analyzePhoto(await compressImageForUpload(uri), code);
  }

  async function takePhotoForAi(code?: string) {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Câmera necessária", "Permita o acesso à câmera para fotografar o produto.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const uri = asset.base64
      ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
      : asset.uri;
    await analyzePhoto(await compressImageForUpload(uri), code);
  }

  async function analyzePhoto(uri: string, code?: string) {
    if (aiProcessing) return;
    setAiProcessing(true);
    try {
      const result = await analyzeProductWithAi({
        barcode: code || barcode,
        imageUri: uri,
        existingProductNames: existingProductNames(products),
      });
      if (code) setBarcode(code);
      if (result.name) setName(result.name);
      if (result.brand) setBrand(result.brand);
      if (result.category) setCategory(result.category);
      if (result.description) setDescription(result.description);
      if (result.packagingType) setPackagingType(result.packagingType);
      if (result.originalUrl) setPhotoOriginal(result.originalUrl);
      if (result.cutoutUrl) {
        setCutoutUrl(result.cutoutUrl);
        setImageUrl(result.cutoutUrl);
      } else if (result.originalUrl) {
        setImageUrl(result.originalUrl);
      } else if (!imageUrl) {
        setImageUrl(uri);
      }

      const topMatch = result.matches?.[0];
      if (topMatch && topMatch.similarity >= 85) {
        const existing = products.find((item) => item.name === topMatch.name && !item.archived);
        Alert.alert(
          "Produto parecido encontrado",
          `"${topMatch.name}" tem ${topMatch.similarity}% de compatibilidade com o que você fotografou. Usar o cadastro existente?`,
          [
            { text: "Continuar novo", style: "cancel" },
            {
              text: "Usar existente",
              onPress: () => {
                if (existing) editProduct(existing);
              },
            },
          ],
        );
      }
      setFormOpen(true);
    } catch (error) {
      Alert.alert(
        "Assistente de IA indisponível",
        error instanceof Error ? error.message : "Verifique a configuração da Edge Function e tente novamente.",
      );
    } finally {
      setAiProcessing(false);
    }
  }

  async function processPhotoWithAi(product: Product) {
    setActionProduct(null);
    setAiProcessing(true);
    try {
      const result = await analyzeProductWithAi({
        barcode: product.barcode,
        imageUri: product.photoOriginalUrl || product.imageUrl || "",
        existingProductNames: existingProductNames(products),
      });
      if (!result.cutoutUrl && !result.name) {
        Alert.alert("IA indisponível", "Não foi possível processar a foto agora.");
        return;
      }
      const updated: Product = {
        ...product,
        name: result.name || product.name,
        brand: result.brand || product.brand,
        category: result.category || product.category,
        description: result.description || product.description,
        packagingType: result.packagingType || product.packagingType,
        photoOriginalUrl: result.originalUrl || product.photoOriginalUrl || product.imageUrl,
        photoCutoutUrl: result.cutoutUrl || product.photoCutoutUrl,
        imageUrl: result.cutoutUrl || result.originalUrl || product.imageUrl,
      };
      await persist(products.map((item) => (item.id === product.id ? updated : item)));
      await recordImageHistory({
        productId: product.id,
        originalUrl: updated.photoOriginalUrl,
        cutoutUrl: updated.photoCutoutUrl,
      });

      Alert.alert(
        result.cutoutUrl ? "Foto processada" : "Produto atualizado",
        result.cutoutUrl
          ? "O fundo foi removido e a foto sem fundo foi salva no cadastro."
          : "Os dados do produto foram atualizados pela IA.",
      );
    } catch (error) {
      Alert.alert(
        "Assistente de IA indisponível",
        error instanceof Error ? error.message : "Tente novamente.",
      );
    } finally {
      setAiProcessing(false);
    }
  }

  async function saveProduct() {
    const parsedDate = parseBrazilianDate(expiry);
    const numericQuantity = Number(quantity);
    if (!name.trim()) {
      Alert.alert("Informe o produto", "Digite o nome do produto.");
      return;
    }
    if (!parsedDate) {
      Alert.alert("Data inválida", "Use o formato DD/MM/AAAA.");
      return;
    }
    if (!Number.isInteger(numericQuantity) || numericQuantity < 1) {
      Alert.alert("Quantidade inválida", "Informe um número inteiro maior que zero.");
      return;
    }

    const expiresAt = dateToIso(parsedDate);
    const existing = editingId
      ? products.find((item) => item.id === editingId)
      : undefined;
    if (existing) await cancelNotifications(existing.notificationIds);

    const hasCutout = Boolean(cutoutUrl);
    let savedImageUrl = imageUrl || undefined;
    if (!isDemo && session?.user.id && barcode.trim() && !hasCutout) {
      try {
        savedImageUrl = await contributeCatalogProduct(
          session.user.id,
          barcode,
          name,
          savedImageUrl,
          category,
        );
      } catch {
        Alert.alert(
          "Produto salvo sem compartilhar",
          "Não foi possível atualizar o catálogo compartilhado agora.",
        );
      }
    }

    const notificationIds = await scheduleExpiryNotifications(
      name.trim(),
      expiresAt,
      category,
      notificationPreferences,
    );
    const product: Product = {
      id: existing?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: name.trim(),
      imageUrl: hasCutout ? cutoutUrl : (savedImageUrl || undefined),
      photoOriginalUrl: hasCutout
        ? (photoOriginal.trim() || savedImageUrl || undefined)
        : (savedImageUrl || photoOriginal.trim() || undefined),
      photoCutoutUrl: hasCutout ? cutoutUrl : (existing?.photoCutoutUrl || undefined),
      brand: brand.trim() || existing?.brand || undefined,
      description: description.trim() || existing?.description || undefined,
      packagingType: packagingType.trim() || existing?.packagingType || undefined,
      category,
      barcode: barcode.trim(),
      expiresAt,
      quantity: numericQuantity,
      notes: notes.trim() || undefined,
      archived: existing?.archived || false,
      archivedAt: existing?.archivedAt,
      createdAt: existing?.createdAt || new Date().toISOString(),
      notificationIds,
    };
    await persist(
      existing
        ? products.map((item) => item.id === existing.id ? product : item)
        : [...products, product],
    );

    if (hasCutout && existing?.photoCutoutUrl !== product.photoCutoutUrl) {
      await recordImageHistory({
        productId: product.id,
        originalUrl: product.photoOriginalUrl,
        cutoutUrl: product.photoCutoutUrl,
      });
    }
    resetForm();
    setFormOpen(false);
  }

  function editProduct(product: Product) {
    setActionProduct(null);
    setEditingId(product.id);
    setName(product.name);
    setImageUrl(product.photoCutoutUrl || product.imageUrl || "");
    setPhotoOriginal(product.photoOriginalUrl || product.imageUrl || "");
    setCutoutUrl(product.photoCutoutUrl || "");
    setBrand(product.brand || "");
    setDescription(product.description || "");
    setPackagingType(product.packagingType || "");
    setBarcode(product.barcode);
    setExpiry(formatBrazilianDate(product.expiresAt));
    setQuantity(String(product.quantity));
    setCategory(product.category || "Mercearia");
    setNotes(product.notes || "");
    setFormOpen(true);
  }

  function showProductActions(product: Product) {
    setActionProduct(product);
  }

  async function removeProduct(product: Product) {
    await cancelNotifications(product.notificationIds);

    await persist(products.filter((item) => item.id !== product.id));
    setActionProduct(null);
  }

  function toggleProductSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function closeSelectionMode() {
    setSelectionMode(false);
    setBulkDeleteMode(false);
    setSelectedIds(new Set());
  }

  function startPdfSelection() {
    setBulkDeleteMode(false);
    setSelectedIds(new Set());
    setSelectionMode(true);
  }

  function startBulkDelete() {
    setBulkDeleteMode(true);
    setSelectedIds(new Set());
    setSelectionMode(true);
  }

  async function removeSelectedProducts() {
    if (removingSelected) return;
    Alert.alert(
      "Remover selecionados",
      "Deseja realmente remover os itens selecionados?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar remoção",
          style: "destructive",
          onPress: async () => {
            setRemovingSelected(true);
            try {
              const selected = products.filter((product) => selectedIds.has(product.id));
              await Promise.all(
                selected.map((product) => cancelNotifications(product.notificationIds)),
              );
              await persist(products.filter((product) => !selectedIds.has(product.id)));
              closeSelectionMode();
              Alert.alert("Remoção concluída", "Os itens selecionados foram removidos.");
            } catch {
              Alert.alert("Não foi possível remover", "Tente novamente.");
            } finally {
              setRemovingSelected(false);
            }
          },
        },
      ],
    );
  }

  function toggleCategorySelection(categoryOption: ProductCategory) {
    const categoryIds = products
      .filter((product) => (product.category || "Mercearia") === categoryOption)
      .map((product) => product.id);
    if (!categoryIds.length) return;

    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = categoryIds.every((id) => next.has(id));
      categoryIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  function toggleExpiringSelection() {
    const expiringIds = products
      .filter((product) => {
        const days = daysUntil(product.expiresAt);
        const productCategory = product.category || "Mercearia";
        const advanceDays =
          productCategory === "Açougue" || productCategory === "Frios/PAS"
            ? 15
            : 30;
        return days >= 0 && days <= advanceDays;
      })
      .map((product) => product.id);
    if (!expiringIds.length) return;

    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = expiringIds.every((id) => next.has(id));
      expiringIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  async function generateSelectedPdf() {
    const selected = sorted.filter((product) => selectedIds.has(product.id));
    if (!selected.length) {
      Alert.alert("Selecione os produtos", "Marque pelo menos um produto para gerar o PDF.");
      return;
    }

    const escapeHtml = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

    const rows = PRODUCT_CATEGORIES.map((categoryOption) => {
      const categoryProducts = selected.filter(
        (product) => (product.category || "Mercearia") === categoryOption,
      );
      if (!categoryProducts.length) return "";
      const productRows = categoryProducts.map((product) => {
          const days = daysUntil(product.expiresAt);
          const status = expiryLabel(days);
          return `
          <tr>
            <td>
              <strong>${escapeHtml(product.name)}</strong>
              <span class="category">${escapeHtml(product.category || "Mercearia")}</span>
              ${product.barcode ? `<span class="barcode">Código de barras: ${escapeHtml(product.barcode)}</span>` : ""}
            </td>
            <td class="center">${product.quantity}</td>
            <td>${formatBrazilianDate(product.expiresAt)}</td>
            <td><span class="status">${escapeHtml(status)}</span></td>
          </tr>`;
        }).join("");
      return `<tr class="category-row"><td colspan="4">${escapeHtml(categoryOption)} - ${categoryProducts.length} produto${categoryProducts.length === 1 ? "" : "s"}</td></tr>${productRows}`;
    }).join("");

    const generatedAt = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date());
    const companyLogo = company?.logoUrl || "";
    const companyTitle = company?.companyName || company?.name || "Prazo Certo";
    const groupName = company?.name || "Lista pessoal";
    const companySector = company?.sector || "Nao informado";

    const html = `<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <style>
            @page { margin: 32px 32px 44px; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #000; margin: 0; font-size: 12px; }
            .header { display: flex; align-items: center; gap: 14px; background: #FFF; color: #000; padding: 16px 0 12px; border-bottom: 2px solid #000; }
            .logo { width: 58px; height: 58px; object-fit: contain; border: 1px solid #DDD; border-radius: 10px; padding: 5px; }
            .brand { font-size: 26px; font-weight: 800; margin: 0 0 5px; }
            .subtitle { color: #333; margin: 0; }
            .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 18px; margin: 18px 2px 12px; color: #333; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #FFF; color: #000; padding: 11px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; border-top: 1px solid #000; border-bottom: 1px solid #000; }
            td { padding: 13px 11px; border-bottom: 1px solid #AAA; vertical-align: middle; }
            td strong { display: block; font-size: 13px; margin-bottom: 4px; }
            td span { color: #333; font-size: 10px; }
            .category { display: block; margin-bottom: 5px; }
            .barcode { display: block; margin-top: 6px; font-size: 16px; font-weight: 800; letter-spacing: 1.5px; color: #000; }
            .notes { display: block; margin-top: 5px; }
            .center { text-align: center; }
            .status { display: inline-block; padding: 6px 8px; border: 1px solid #000; border-radius: 5px; color: #000; font-weight: 700; white-space: nowrap; }
            .category-row td { background: #FFF; color: #000; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; border-top: 2px solid #000; border-bottom: 1px solid #000; padding: 9px 11px; }
            .footer { position: fixed; right: 0; bottom: -22px; color: #555; font-size: 9px; text-align: right; }
          </style>
        </head>
        <body>
          <div class="header">
            ${companyLogo ? `<img class="logo" src="${escapeHtml(companyLogo)}" />` : ""}
            <div>
            <p class="brand">Prazo Certo</p>
            <p class="subtitle">Relatório de validade dos produtos selecionados</p>
            </div>
          </div>
          <div class="meta">
            <span>Gerado em ${escapeHtml(generatedAt)}</span>
            <span>Empresa: ${escapeHtml(companyTitle)}</span>
            <span>Grupo: ${escapeHtml(groupName)}</span>
            <span>Setor responsavel: ${escapeHtml(companySector)}</span>
            <strong>${selected.length} produto${selected.length === 1 ? "" : "s"}</strong>
          </div>
          <table>
            <thead><tr><th>Produto</th><th class="center">Qtd.</th><th>Validade</th><th>Situação</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="footer">Gerado pelo Prazo Certo</div>
        </body>
      </html>`;

    try {
      setExportingPdf(true);
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
        Alert.alert("PDF pronto", "Use a janela de impressão do navegador para salvar o PDF.");
        return;
      }
      const file = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          dialogTitle: "Compartilhar relatório do Prazo Certo",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("PDF criado", `Arquivo salvo em: ${file.uri}`);
      }
    } catch {
      Alert.alert("Não foi possível gerar o PDF", "Tente novamente em alguns instantes.");
    } finally {
      setExportingPdf(false);
    }
  }

  async function buildTestProducts(currentProducts: Product[]) {
    const productPool: Array<{
      name: string;
      barcode: string;
      category: ProductCategory;
      quantity: number;
      imageUrl: string;
    }> = [
      { name: "Leite condensado - teste", barcode: "7891000100103", category: "Mercearia", quantity: 2, imageUrl: "https://images.openfoodfacts.org/images/products/789/100/010/0103/front_pt.34.200.jpg" },
      { name: "Creme de avelã - teste", barcode: "3017620422003", category: "Saudáveis", quantity: 1, imageUrl: "https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.879.200.jpg" },
      { name: "Molho pesto - teste", barcode: "8076809513753", category: "Frios/PAS", quantity: 2, imageUrl: "https://images.openfoodfacts.org/images/products/807/680/951/3753/front_en.347.200.jpg" },
      { name: "Biscoito recheado - teste", barcode: "7622210449283", category: "Mercearia", quantity: 4, imageUrl: "https://images.openfoodfacts.org/images/products/762/221/044/9283/front_en.605.200.jpg" },
      { name: "Refrigerante Coca-Cola - teste", barcode: "7894900011517", category: "Mercearia", quantity: 3, imageUrl: "https://images.openfoodfacts.org/images/products/789/490/001/1517/front_pt.13.200.jpg" },
      { name: "H2O Limoneto - teste", barcode: "7892840812850", category: "Saudáveis", quantity: 2, imageUrl: "https://images.openfoodfacts.org/images/products/789/284/081/2850/front_pt.25.200.jpg" },
      { name: "Leite integral - teste", barcode: "7891025101604", category: "Frios/PAS", quantity: 5, imageUrl: "https://images.openfoodfacts.org/images/products/789/102/510/1604/front_pt.4.200.jpg" },
      { name: "Chá Matte Leão - teste", barcode: "7891098038456", category: "Saudáveis", quantity: 2, imageUrl: "https://images.openfoodfacts.org/images/products/789/109/803/8456/front_pt.17.200.jpg" },
      { name: "Soda Limonada - teste", barcode: "7891991000833", category: "Mercearia", quantity: 4, imageUrl: "https://images.openfoodfacts.org/images/products/789/199/100/0833/front_pt.20.200.jpg" },
    ];
    const shuffledProducts = [...productPool];
    for (let index = shuffledProducts.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffledProducts[index], shuffledProducts[randomIndex]] = [
        shuffledProducts[randomIndex],
        shuffledProducts[index],
      ];
    }
    const dateOffsets = [-1, 0, 1, 3, 7];
    const samples = shuffledProducts.slice(0, 5).map((product, index) => ({
      ...product,
      offsetDays: dateOffsets[index],
    }));
    const baseProducts = currentProducts.filter((item) => !item.name.endsWith(" - teste"));
    const previousTestProducts = currentProducts.filter((item) => item.name.endsWith(" - teste"));
    const newProducts: Product[] = await Promise.all(
      samples.map(async (sample, index) => {
        const expiryDate = new Date();
        expiryDate.setHours(12, 0, 0, 0);
        expiryDate.setDate(expiryDate.getDate() + sample.offsetDays);
        const previousProduct = previousTestProducts.find(
          (product) => product.barcode === sample.barcode,
        );
        const found = previousProduct?.imageUrl
          ? { name: previousProduct.name.replace(/ - teste$/, ""), imageUrl: previousProduct.imageUrl }
          : await lookupProduct(sample.barcode);
        return {
          id: `test-${Date.now()}-${index}`,
          name: found?.name ? `${found.name} - teste` : sample.name,
          imageUrl: found?.imageUrl || sample.imageUrl,
          barcode: sample.barcode,
          category: sample.category,
          quantity: sample.quantity,
          expiresAt: dateToIso(expiryDate),
          createdAt: new Date().toISOString(),
          notificationIds: [],
        };
      }),
    );

    return [...baseProducts, ...newProducts];
  }



  if (authLoading) {
    return (
      <SafeAreaView style={styles.authLoading}>
        <Image source={require("../assets/seal.png")} style={styles.authLoadingLogo} />
        <ActivityIndicator color="#FFF" />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <AuthScreen
        onDemo={() =>
          setSession({
            access_token: "demo",
            refresh_token: "demo",
            expires_in: 3600,
            token_type: "bearer",
            user: {
              id: "demo-user",
              app_metadata: {},
              user_metadata: { full_name: "Visitante" },
              aud: "authenticated",
              created_at: new Date().toISOString(),
              email: "modo.teste@prazocerto.app",
            },
          } as Session)
        }
      />
    );
  }
  if (companyLoading) {
    return (
      <SafeAreaView style={styles.authLoading}>
        <Image source={require("../assets/seal.png")} style={styles.authLoadingLogo} />
        <ActivityIndicator color="#FFF" />
      </SafeAreaView>
    );
  }
  if (companySetupOpen) {
    return (
      <CompanyScreen
        onReady={(nextCompany) => {
          setCompany(nextCompany);
          setCompanySetupOpen(false);
        }}
        onCancel={() => setCompanySetupOpen(false)}
        initialMode={companySetupMode}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.hero}>
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <View style={styles.brandRow}>
              <Pressable
                style={styles.profileButton}
                onPress={() => setProfileMenuOpen(true)}
                accessibilityLabel="Abrir menu do perfil"
              >
                {profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.profilePhoto} />
                ) : (
                  <Text style={styles.profileInitial}>{profileName.charAt(0).toUpperCase()}</Text>
                )}
                <View style={styles.menuLines}>
                  <View style={styles.menuLine} />
                  <View style={styles.menuLine} />
                  <View style={styles.menuLine} />
                </View>
              </Pressable>
              <Text style={styles.heroMessage}>
                PRAZO <Text style={styles.heroAccent}>CERTO</Text>
              </Text>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Prazo Certo",
                    "Aplicativo para controlar a validade de produtos, reduzir perdas e agir antes do vencimento.",
                  )
                }
                accessibilityLabel="Sobre o Prazo Certo"
              >
                <Image
                  source={require("../assets/seal.png")}
                  style={styles.brandLogo}
                  resizeMode="contain"
                />
              </Pressable>
            </View>
            <View style={styles.companyLineRow}>
              {company?.logoUrl ? (
                <Image source={{ uri: company.logoUrl }} style={styles.companyLogo} />
              ) : null}
              <Text style={styles.companyLine} numberOfLines={1}>
                {company ? `${company.name}  •  Código: ${company.inviteCode}` : "Minha lista pessoal"}
              </Text>
            </View>
          </View>
        </View>

        {Platform.OS === "web" ? (
          <Pressable
            accessibilityRole="link"
            style={styles.portfolioBackMain}
            onPress={() => Linking.openURL("https://portfolio-3d-eight-nu.vercel.app/#projetos")}
          >
            <Text style={styles.portfolioBackMainText}>← VOLTAR AO PORTFÓLIO</Text>
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          {Platform.OS !== "web" ? (
          <Pressable style={styles.scanButton} onPress={openScanner}>
            <View style={styles.scanIconWrap}><BarcodeIcon size={25} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scanText}>Código de barras</Text>
              <Text style={styles.scanSubtext}>Toque para escanear o produto</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </Pressable>
          ) : null}
          {rolePermissions.canAdd ? (
            <Pressable style={styles.addButton} onPress={() => setFormOpen(true)}>
              <Text style={styles.addText}>＋</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Modal
        visible={profileMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileMenuOpen(false)}
      >
        <View style={styles.profileMenuBackdrop}>
          <View style={styles.profileMenu}>
            <Pressable
              style={styles.profileMenuHeader}
              onPress={() => openMenuScreen("profile")}
              accessibilityLabel="Abrir meu perfil"
            >
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.profileMenuPhoto} />
              ) : (
                <View style={styles.profileMenuFallback}>
                  <Text style={styles.profileMenuInitial}>{profileName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.profileMenuName}>{profileName}</Text>
              <Text style={styles.profileMenuEmail}>{session.user.email}</Text>
              <Text style={styles.profileMenuHeaderHint}>Toque para editar o perfil</Text>
            </Pressable>
            {company ? (
              <>
                <View style={styles.profileMenuCompany}>
                  <Text style={styles.profileMenuLabel}>GRUPO DE LISTA</Text>
                  {company.logoUrl ? (
                    <Image source={{ uri: company.logoUrl }} style={styles.profileCompanyLogo} />
                  ) : null}
                  <Text style={styles.profileMenuCompanyName}>{company.name}</Text>
                  <Text style={styles.profileMenuCode}>Código para entrar: {company.inviteCode}</Text>
                </View>
                {company.role === "owner" || company.role === "admin" ? (
                  <Pressable
                    style={styles.profileMenuManage}
                    onPress={() => {
                      setProfileMenuOpen(false);
                      setCompanyManagerOpen(true);
                    }}
                  >
                    <Text style={styles.profileMenuManageText}>Gerenciar equipe</Text>
                    <Text style={styles.profileMenuManageArrow}>›</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                <View style={styles.profileMenuPersonal}>
                  <Text style={styles.profileMenuLabel}>MODO ATUAL</Text>
                  <Text style={styles.profileMenuCompanyName}>Lista pessoal</Text>
                  <Text style={styles.profileMenuCode}>Somente você pode ver estes produtos.</Text>
                </View>
                <Pressable
                  style={[styles.profileMenuManage, styles.profileMenuCreate]}
                  onPress={() => {
                    setProfileMenuOpen(false);
                    setCompanySetupMode("create");
                    setCompanySetupOpen(true);
                  }}
                >
                  <Text style={[styles.profileMenuManageText, styles.profileMenuCreateText]}>Criar grupo</Text>
                  <Text style={[styles.profileMenuManageArrow, styles.profileMenuCreateText]}>›</Text>
                </Pressable>
                <Pressable
                  style={styles.profileMenuJoin}
                  onPress={() => {
                    setProfileMenuOpen(false);
                    setCompanySetupMode("join");
                    setCompanySetupOpen(true);
                  }}
                >
                  <Text style={styles.profileMenuJoinText}>Entrar em um grupo</Text>
                  <Text style={styles.profileMenuManageArrow}>›</Text>
                </Pressable>
              </>
            )}
            <View style={styles.profileMenuOptions}>
              <Pressable
                style={styles.profileMenuOption}
                onPress={() => openMenuScreen("profile")}
              >
                <View style={styles.profileMenuOptionIcon}>
                  <Text style={styles.profileMenuOptionIconText}>P</Text>
                </View>
                <Text style={styles.profileMenuOptionText}>Meu perfil</Text>
                <Text style={styles.profileMenuOptionArrow}>›</Text>
              </Pressable>
              <Pressable
                style={styles.profileMenuOption}
                onPress={() => openMenuScreen("notifications")}
              >
                <View style={styles.profileMenuOptionIcon}>
                  <Text style={styles.profileMenuOptionIconText}>N</Text>
                </View>
                <Text style={styles.profileMenuOptionText}>Notificações</Text>
                <Text style={styles.profileMenuOptionArrow}>›</Text>
              </Pressable>
              <Pressable
                style={styles.profileMenuOption}
                onPress={() => {
                  setProfileMenuOpen(false);
                  setHistoryOpen(true);
                }}
              >
                <View style={styles.profileMenuOptionIcon}>
                  <Text style={styles.profileMenuOptionIconText}>H</Text>
                </View>
                <Text style={styles.profileMenuOptionText}>Histórico</Text>
                <Text style={styles.profileMenuOptionArrow}>›</Text>
              </Pressable>
              <Pressable
                style={styles.profileMenuOption}
                onPress={() => openMenuScreen("reports")}
              >
                <View style={styles.profileMenuOptionIcon}>
                  <Text style={styles.profileMenuOptionIconText}>R</Text>
                </View>
                <Text style={styles.profileMenuOptionText}>Relatórios</Text>
                <Text style={styles.profileMenuOptionArrow}>›</Text>
              </Pressable>
              <Pressable
                style={[styles.profileMenuOption, styles.profileMenuOptionLast]}
                onPress={() => openMenuScreen("help")}
              >
                <View style={styles.profileMenuOptionIcon}>
                  <Text style={styles.profileMenuOptionIconText}>?</Text>
                </View>
                <Text style={styles.profileMenuOptionText}>Ajuda</Text>
                <Text style={styles.profileMenuOptionArrow}>›</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.profileMenuExit}
              onPress={async () => {
                setProfileMenuOpen(false);
                await supabase.auth.signOut();
              }}
            >
              <Text style={styles.profileMenuExitText}>Sair da conta</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.profileMenuDismiss}
            onPress={() => setProfileMenuOpen(false)}
            accessibilityLabel="Fechar menu"
          />
        </View>
      </Modal>

      <Modal
        visible={menuScreen !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuScreen(null)}
      >
        <View style={styles.menuScreenBackdrop}>
          <Pressable style={styles.menuScreenDismiss} onPress={() => setMenuScreen(null)} />
          <View style={styles.menuScreenSheet}>
            <View style={styles.menuScreenHandle} />
            <View style={styles.menuScreenHeader}>
              <View>
                <Text style={styles.menuScreenEyebrow}>PRAZO CERTO</Text>
                <Text style={styles.menuScreenTitle}>
                  {menuScreen === "profile"
                    ? "Meu perfil"
                    : menuScreen === "notifications"
                      ? "Notificações"
                      : menuScreen === "reports"
                        ? "Relatórios"
                        : "Ajuda"}
                </Text>
              </View>
              <Pressable
                style={styles.menuScreenClose}
                onPress={() => setMenuScreen(null)}
                accessibilityLabel="Fechar"
              >
                <Text style={styles.menuScreenCloseText}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.menuScreenScroll}
              contentContainerStyle={styles.menuScreenContent}
              showsVerticalScrollIndicator={false}
            >
              {menuScreen === "profile" ? (
                <>
                  <View style={styles.profileEditorPhotoWrap}>
                    <Pressable onPress={chooseProfilePhoto} accessibilityLabel="Trocar foto do perfil">
                      {profilePhotoDraft ? (
                        <Image source={{ uri: profilePhotoDraft }} style={styles.profileEditorPhoto} />
                      ) : (
                        <View style={styles.profileEditorFallback}>
                          <Text style={styles.profileEditorInitial}>
                            {(profileNameDraft || profileName).charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.profileEditorCameraBadge}>
                        <Text style={styles.profileEditorCameraText}>+</Text>
                      </View>
                    </Pressable>
                    <Text style={styles.profileEditorName}>{profileName}</Text>
                  </View>
                  <View style={styles.profileEmailCard}>
                    <Text style={styles.profileEmailLabel}>E-MAIL DA CONTA</Text>
                    <Text style={styles.profileEmailValue}>{session.user.email}</Text>
                  </View>
                  <Pressable style={styles.menuPrimaryButton} onPress={saveProfile}>
                    <Text style={styles.menuPrimaryButtonText}>Salvar foto do perfil</Text>
                  </Pressable>
                </>
              ) : null}

              {menuScreen === "notifications" ? (
                <>
                  <Text style={styles.menuScreenDescription}>
                    Escolha quando o Prazo Certo deve avisar sobre os produtos cadastrados.
                  </Text>
                  <View style={styles.settingCard}>
                    <View style={styles.settingTextWrap}>
                      <Text style={styles.settingTitle}>Ativar notificações</Text>
                      <Text style={styles.settingDescription}>Liga ou desliga todos os avisos.</Text>
                    </View>
                    <Switch
                      value={notificationPreferences.enabled}
                      onValueChange={(enabled) =>
                        setNotificationPreferences((current) => ({ ...current, enabled }))
                      }
                      trackColor={{ false: "#CAD3CE", true: "#8CC7AB" }}
                      thumbColor={notificationPreferences.enabled ? "#1E7A55" : "#F4F4F4"}
                    />
                  </View>
                  {[
                    ["advance", "Aviso antecipado", "30 dias antes; 15 dias para Açougue e Frios/PAS."],
                    ["sevenDays", "7 dias antes", "Uma semana antes do vencimento."],
                    ["oneDay", "1 dia antes", "Um lembrete no dia anterior."],
                    ["expiryDay", "No vencimento", "Aviso no próprio dia da validade."],
                  ].map(([key, title, description]) => (
                    <View style={styles.settingCard} key={key}>
                      <View style={styles.settingTextWrap}>
                        <Text style={styles.settingTitle}>{title}</Text>
                        <Text style={styles.settingDescription}>{description}</Text>
                      </View>
                      <Switch
                        disabled={!notificationPreferences.enabled}
                        value={
                          notificationPreferences.enabled &&
                          notificationPreferences[key as keyof NotificationPreferences]
                        }
                        onValueChange={(value) =>
                          setNotificationPreferences((current) => ({ ...current, [key]: value }))
                        }
                        trackColor={{ false: "#CAD3CE", true: "#8CC7AB" }}
                        thumbColor="#1E7A55"
                      />
                    </View>
                  ))}
                  <Pressable style={styles.menuPrimaryButton} onPress={saveNotificationPreferences}>
                    <Text style={styles.menuPrimaryButtonText}>Salvar preferências</Text>
                  </Pressable>
                </>
              ) : null}

              {menuScreen === "reports" ? (
                <>
                  <Text style={styles.menuScreenDescription}>
                    Visão geral da sua lista atual de produtos.
                  </Text>
                  <View style={styles.reportHero}>
                    <Text style={styles.reportHeroNumber}>{products.length}</Text>
                    <Text style={styles.reportHeroLabel}>produtos cadastrados</Text>
                    <Text style={styles.reportHeroUnits}>{totalUnits} unidades no total</Text>
                  </View>
                  <View style={styles.reportGrid}>
                    <View style={[styles.reportCard, styles.reportCardExpired]}>
                      <Text style={styles.reportCardNumber}>{stats.expired}</Text>
                      <Text style={styles.reportCardLabel}>Vencidos</Text>
                    </View>
                    <View style={[styles.reportCard, styles.reportCardExpiring]}>
                      <Text style={styles.reportCardNumber}>{stats.expiring}</Text>
                      <Text style={styles.reportCardLabel}>Próximos</Text>
                    </View>
                    <View style={[styles.reportCard, styles.reportCardOk]}>
                      <Text style={styles.reportCardNumber}>{stats.ok}</Text>
                      <Text style={styles.reportCardLabel}>Em dia</Text>
                    </View>
                  </View>
                  <View style={styles.reportInsight}>
                    <Text style={styles.reportInsightTitle}>Ação recomendada</Text>
                    <Text style={styles.reportInsightText}>
                      {stats.expired > 0
                        ? `Revise os ${stats.expired} produtos vencidos e remova-os da seção.`
                        : stats.expiring > 0
                          ? `Planeje o rebaixa dos ${stats.expiring} produtos próximos do vencimento.`
                          : "Sua lista está em dia. Continue cadastrando as novas validades."}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.menuPrimaryButton}
                    onPress={() => {
                      setMenuScreen(null);
                      startPdfSelection();
                    }}
                  >
                    <Text style={styles.menuPrimaryButtonText}>Selecionar produtos para PDF</Text>
                  </Pressable>
                </>
              ) : null}

              {menuScreen === "help" ? (
                <>
                  <Text style={styles.menuScreenDescription}>
                    Respostas rápidas para usar o aplicativo no dia a dia.
                  </Text>
                  {[
                    ["Como cadastrar um produto?", "Toque no botão +, informe a validade e salve. Você também pode usar o leitor de código de barras."],
                    ["Quando receberei avisos?", "Os avisos seguem as opções escolhidas em Notificações e são programados ao cadastrar ou editar um produto."],
                    ["Como funciona o grupo de lista?", "Crie um grupo e compartilhe o código de entrada para todos acessarem a mesma lista."],
                    ["Como gerar um relatório?", "Abra Relatórios, toque em selecionar produtos para PDF e escolha os itens desejados."],
                  ].map(([question, answer]) => (
                    <View style={styles.helpCard} key={question}>
                      <Text style={styles.helpQuestion}>{question}</Text>
                      <Text style={styles.helpAnswer}>{answer}</Text>
                    </View>
                  ))}
                  <View style={styles.helpTip}>
                    <Text style={styles.helpTipTitle}>Dica</Text>
                    <Text style={styles.helpTipText}>
                      Mantenha as quantidades e validades atualizadas para que os relatórios sejam confiáveis.
                    </Text>
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {company ? (
        <CompanyManagerModal
          visible={companyManagerOpen}
          company={company}
          currentUserId={session.user.id}
          onClose={() => setCompanyManagerOpen(false)}
          onCompanyChange={(nextCompany) => setCompany(nextCompany)}
        />
      ) : null}

      <HistoryScreen
        visible={historyOpen}
        load={async () => {
          if (isDemo) return products.filter((product) => product.archived);
          return loadCloudArchivedProducts(company?.id ?? null, session?.user.id ?? "");
        }}
        canDelete={rolePermissions.canDelete}
        onDelete={async (product) => {
          if (isDemo) {
            await persist(products.filter((item) => item.id !== product.id));
            return;
          }
          await deleteCloudProducts([product.id]);
        }}
        onClose={() => setHistoryOpen(false)}
      />

      <View style={styles.dashboard}>
        <View style={styles.stat}>
          <View style={[styles.statDot, { backgroundColor: "#C4382C" }]} />
          <Text style={styles.statNumber}>{stats.expired}</Text>
          <Text style={styles.statLabel}>Vencidos</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <View style={[styles.statDot, { backgroundColor: "#E59A32" }]} />
          <Text style={styles.statNumber}>{stats.expiring}</Text>
          <Text style={styles.statLabel}>Próximos</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <View style={[styles.statDot, { backgroundColor: "#2A9167" }]} />
          <Text style={styles.statNumber}>{stats.ok}</Text>
          <Text style={styles.statLabel}>Em dia</Text>
        </View>
      </View>

      <View style={styles.listHeading}>
        <Text style={styles.listTitle}>Seus produtos</Text>
        <View style={styles.headingActions}>
          {!selectionMode ? (
            <>

              {products.length > 0 && (
                <>
                  <Pressable style={styles.selectButton} onPress={startPdfSelection}>
                    <Text style={styles.selectButtonText}>▤ PDF</Text>
                  </Pressable>
                  {rolePermissions.canDelete ? (
                    <Pressable style={styles.bulkDeleteButton} onPress={startBulkDelete}>
                      <Text style={styles.bulkDeleteButtonText}>Remover</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <>
              <Pressable
                style={[styles.selectButton, styles.selectButtonActive]}
                onPress={() =>
                  setSelectedIds(new Set(sorted.filter((item) => !item.archived).map((item) => item.id)))
                }
              >
                <Text style={[styles.selectButtonText, styles.selectButtonTextActive]}>
                  Tudo
                </Text>
              </Pressable>
              <Pressable
                style={[styles.selectButton, styles.selectButtonActive]}
                onPress={closeSelectionMode}
              >
                <Text style={[styles.selectButtonText, styles.selectButtonTextActive]}>
                  Cancelar
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {selectionMode && !bulkDeleteMode && (
        <View style={styles.categorySelectorWrap}>
          <Text style={styles.categorySelectorTitle}>Selecione as categorias</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categorySelector}
          >
            {(() => {
              const expiringProducts = products.filter((product) => {
                const days = daysUntil(product.expiresAt);
                const productCategory = product.category || "Mercearia";
                const advanceDays =
                  productCategory === "Açougue" || productCategory === "Frios/PAS"
                    ? 15
                    : 30;
                return days >= 0 && days <= advanceDays;
              });
              const active =
                expiringProducts.length > 0 &&
                expiringProducts.every((product) => selectedIds.has(product.id));
              return (
                <Pressable
                  disabled={!expiringProducts.length}
                  style={[
                    styles.expiringSelectorChip,
                    active && styles.expiringSelectorChipActive,
                    !expiringProducts.length && styles.categorySelectorChipDisabled,
                  ]}
                  onPress={toggleExpiringSelection}
                >
                  <Text style={[styles.expiringSelectorText, active && styles.categorySelectorChipTextActive]}>
                    {active ? "✓ " : "⚠ "}Com aviso ({expiringProducts.length})
                  </Text>
                </Pressable>
              );
            })()}
            {PRODUCT_CATEGORIES.map((categoryOption) => {
              const categoryProducts = products.filter(
                (product) => (product.category || "Mercearia") === categoryOption,
              );
              const active =
                categoryProducts.length > 0 &&
                categoryProducts.every((product) => selectedIds.has(product.id));
              return (
                <Pressable
                  key={categoryOption}
                  disabled={!categoryProducts.length}
                  style={[
                    styles.categorySelectorChip,
                    active && styles.categorySelectorChipActive,
                    !categoryProducts.length && styles.categorySelectorChipDisabled,
                  ]}
                  onPress={() => toggleCategorySelection(categoryOption)}
                >
                  <Text style={[styles.categorySelectorChipText, active && styles.categorySelectorChipTextActive]}>
                    {active ? "✓ " : ""}{categoryOption} ({categoryProducts.length})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#1E7A55" style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            sorted.length ? styles.list : styles.emptyWrap,
            selectionMode && { paddingBottom: 110 },
          ]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>⌁</Text>
              <Text style={styles.emptyTitle}>Sua despensa está vazia</Text>
              <Text style={styles.emptyText}>Leia um código de barras ou cadastre seu primeiro produto.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const days = daysUntil(item.expiresAt);
            const itemCategory = item.category || "Mercearia";
            const alertAdvanceDays =
              itemCategory === "Açougue" || itemCategory === "Frios/PAS"
                ? 15
                : 30;
            const hasExpiryAlert = days >= 0 && days <= alertAdvanceDays;
            const color = days < 0 ? "#B42318" : days <= 3 ? "#B54708" : "#1E7A55";
            return (
              <Pressable
                style={[styles.card, selectedIds.has(item.id) && styles.cardSelected]}
                onPress={() => {
                  if (selectionMode) toggleProductSelection(item.id);
                }}
                onLongPress={() => !selectionMode && showProductActions(item)}
              >
                <View style={[styles.statusBar, { backgroundColor: color }]} />
                {selectionMode && (
                  <View style={[styles.selectionCircle, selectedIds.has(item.id) && styles.selectionCircleActive]}>
                    <Text style={styles.selectionCheck}>{selectedIds.has(item.id) ? "✓" : ""}</Text>
                  </View>
                )}
                {item.photoCutoutUrl || item.imageUrl ? (
                  <Image source={{ uri: item.photoCutoutUrl || item.imageUrl }} style={styles.productImage} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Text style={styles.imagePlaceholderText}>▦</Text>
                  </View>
                )}
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <Text style={styles.productName}>{item.name}</Text>
                    <Text style={[styles.badge, { color, backgroundColor: `${color}14` }]}>{expiryLabel(days)}</Text>
                  </View>
                  <Text style={styles.expiry}>Validade: {formatBrazilianDate(item.expiresAt)}</Text>
                  {days < 0 && (
                    <Text style={styles.expiredRemovalNotice}>⚠ Remover da seção</Text>
                  )}
                  {hasExpiryAlert && (
                    <Text style={styles.markdownNotice}>⚠ Pedir rebaixa</Text>
                  )}
                  <View style={styles.cardMeta}>
                    <Text style={styles.categoryBadge}>{item.category || "Mercearia"}</Text>
                    <Text style={styles.details}>
                      {item.quantity} un.{item.barcode ? `  •  ${item.barcode}` : ""}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {selectionMode && (
        <View style={[styles.pdfBar, bulkDeleteMode && styles.deleteBar]}>
          <View>
            <Text style={styles.pdfCount}>{selectedIds.size} selecionado{selectedIds.size === 1 ? "" : "s"}</Text>
            <Text style={styles.pdfHint}>
              {bulkDeleteMode ? "Os produtos selecionados serão excluídos" : "Relatório de validade em PDF"}
            </Text>
          </View>
          <Pressable
            style={[
              styles.pdfButton,
              bulkDeleteMode && styles.deleteSelectedButton,
              (!selectedIds.size || exportingPdf) && styles.pdfButtonDisabled,
            ]}
            disabled={!selectedIds.size || exportingPdf}
            onPress={bulkDeleteMode ? removeSelectedProducts : generateSelectedPdf}
          >
            {exportingPdf ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.pdfButtonText}>{bulkDeleteMode ? "Remover" : "Gerar PDF"}</Text>
            )}
          </Pressable>
        </View>
      )}

      <Modal
        visible={Boolean(actionProduct)}
        transparent
        animationType="fade"
        onRequestClose={() => setActionProduct(null)}
      >
        <Pressable style={styles.actionBackdrop} onPress={() => setActionProduct(null)}>
          <Pressable style={styles.actionSheet} onPress={() => undefined}>
            <View style={styles.actionHandle} />
            {actionProduct && (
              <>
                <View style={styles.actionProductHeader}>
                  {actionProduct.photoCutoutUrl || actionProduct.imageUrl ? (
                    <Image source={{ uri: actionProduct.photoCutoutUrl || actionProduct.imageUrl }} style={styles.actionProductImage} />
                  ) : (
                    <View style={styles.actionProductPlaceholder}><BarcodeIcon size={28} color="#789087" /></View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionEyebrow}>GERENCIAR PRODUTO</Text>
                    <Text style={styles.actionProductName} numberOfLines={2}>{actionProduct.name}</Text>
                    <View style={styles.actionMetaRow}>
                      <Text style={styles.actionCategory}>{actionProduct.category || "Mercearia"}</Text>
                      <Text style={styles.actionExpiry}>{formatBrazilianDate(actionProduct.expiresAt)}</Text>
                    </View>
                  </View>
                </View>

                <Pressable
                  style={styles.selectActionButton}
                  onPress={() => {
                    if (actionProduct) {
                      setSelectedIds(new Set([actionProduct.id]));
                      setSelectionMode(true);
                    }
                    setActionProduct(null);
                  }}
                >
                  <View style={styles.actionButtonIcon}><Text style={styles.editActionIcon}>☑</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.editActionTitle}>Selecionar produto</Text>
                    <Text style={styles.editActionDescription}>Marcar para gerar PDF ou remover em grupo</Text>
                  </View>
                  <Text style={styles.editActionArrow}>›</Text>
                </Pressable>

                {rolePermissions.canAdd && actionProduct.imageUrl && !actionProduct.photoCutoutUrl ? (
                  <Pressable style={styles.aiActionButton} onPress={() => processPhotoWithAi(actionProduct)}>
                    <Text style={styles.aiActionText}>✨ Processar foto com IA (remover fundo)</Text>
                  </Pressable>
                ) : null}
                {rolePermissions.canAdd ? (
                <Pressable style={styles.editActionButton} onPress={() => editProduct(actionProduct)}>
                  <View style={styles.actionButtonIcon}><Text style={styles.editActionIcon}>✎</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.editActionTitle}>Editar produto</Text>
                    <Text style={styles.editActionDescription}>Alterar nome, categoria, quantidade ou validade</Text>
                  </View>
                  <Text style={styles.editActionArrow}>›</Text>
                </Pressable>

                ) : null}

                {rolePermissions.canDelete ? (
                <Pressable style={styles.removeActionButton} onPress={() => removeProduct(actionProduct)}>
                  <Text style={styles.removeActionText}>Remover produto</Text>
                </Pressable>
                ) : null}
                <Pressable style={styles.cancelActionButton} onPress={() => setActionProduct(null)}>
                  <Text style={styles.cancelActionText}>Cancelar</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={formOpen} animationType="slide" transparent onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{editingId ? "Editar produto" : "Novo produto"}</Text>
            <View style={styles.previewWrap}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.previewImage} />
              ) : (
                <View style={styles.previewImagePlaceholder}>
                  <Text style={styles.previewImagePlaceholderText}>+</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.previewTitle}>
                  {imageUrl ? "Foto do produto" : "Adicionar foto"}
                </Text>
                <Text style={styles.previewText}>
                  {imageUrl ? "Toque para trocar a imagem." : "Ajude a completar o catálogo compartilhado."}
                </Text>
              </View>
              <Pressable style={styles.productPhotoButton} onPress={chooseProductPhoto}>
                <Text style={styles.productPhotoButtonText}>{imageUrl ? "Trocar" : "Escolher"}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.aiButton} onPress={() => startAiPhoto()} disabled={aiProcessing}>
              {aiProcessing ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.aiButtonText}>✨ Identificar por foto com IA</Text>
              )}
            </Pressable>
            <Text style={styles.label}>Nome do produto</Text>
            <View style={styles.inputWrap}>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ex.: Leite integral" />
              {lookingUp && <ActivityIndicator color="#1E7A55" />}
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Marca</Text>
                <TextInput style={styles.inputSolo} value={brand} onChangeText={setBrand} placeholder="Opcional" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Tipo de embalagem</Text>
                <TextInput style={styles.inputSolo} value={packagingType} onChangeText={setPackagingType} placeholder="Ex.: Longa vida" />
              </View>
            </View>
            <Text style={styles.label}>Código de barras</Text>
            <View style={styles.barcodeRow}>
              <TextInput
                style={[styles.inputSolo, styles.barcodeInput]}
                value={barcode}
                onChangeText={setBarcode}
                keyboardType="number-pad"
                placeholder="Opcional"
              />
              {Platform.OS !== "web" ? (
                <Pressable
                  style={styles.barcodeCameraButton}
                  onPress={openFieldScanner}
                  accessibilityLabel="Escanear código de barras com a câmera"
                >
                  <Text style={styles.barcodeCameraText}>📷</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.label}>Categoria</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryOptions}
              keyboardShouldPersistTaps="handled"
            >
              {PRODUCT_CATEGORIES.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.categoryOption, category === option && styles.categoryOptionActive]}
                  onPress={() => setCategory(option)}
                >
                  <Text style={[styles.categoryOptionText, category === option && styles.categoryOptionTextActive]}>
                    {option}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.row}>
              <View style={{ flex: 2 }}>
                <Text style={styles.label}>Data de validade</Text>
                <TextInput
                  style={styles.inputSolo}
                  value={expiry}
                  onChangeText={(value) => setExpiry(maskBrazilianDate(value))}
                  keyboardType="number-pad"
                  placeholder="DD/MM/AAAA"
                  maxLength={10}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Quantidade</Text>
                <TextInput style={styles.inputSolo} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
              </View>
            </View>

            <Text style={styles.hint}>
              {category === "Açougue" || category === "Frios/PAS"
                  ? "Avisos: 15 dias, 7 dias, 1 dia antes e no vencimento."
                  : "Avisos: 1 mês, 7 dias, 1 dia antes e no vencimento."}
            </Text>
            <Pressable style={styles.saveButton} onPress={saveProduct}>
              <Text style={styles.saveText}>{editingId ? "Salvar alterações" : "Salvar produto"}</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => { setFormOpen(false); resetForm(); }}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={scannerOpen} animationType="fade" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.cameraScreen}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"] }}
            onBarcodeScanned={({ data }) =>
              scannerFieldOnly ? onFieldBarcodeScanned(data) : onBarcodeScanned(data)
            }
          />
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraTitle}>Aponte para o código de barras</Text>
            <View style={styles.scanFrame} />
            <Pressable style={styles.closeCamera} onPress={() => setScannerOpen(false)}><Text style={styles.closeCameraText}>Cancelar</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  authLoading: { flex: 1, backgroundColor: "#174D3B", alignItems: "center", justifyContent: "center", gap: 14 },
  authLoadingLogo: { width: 112, height: 112, resizeMode: "contain" },
  safe: { flex: 1, backgroundColor: "#F4F6F2" },
  hero: { backgroundColor: "#174D3B", paddingBottom: 38, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  header: { paddingHorizontal: 22, paddingTop: 44, paddingBottom: 14 },
  portfolioBackMain: { alignSelf: "center", minHeight: 34, borderRadius: 10, borderWidth: 1, borderColor: "#BCE5CE", backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 12, paddingHorizontal: 14 },
  portfolioBackMainText: { color: "#E8F7EF", fontSize: 10, fontWeight: "900", letterSpacing: 0.35 },
  brandBlock: { width: "100%" },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  heroMessage: { position: "absolute", left: 62, right: 62, textAlign: "center", fontSize: 24, lineHeight: 32, color: "#FFFFFF", fontWeight: "800" },
  heroAccent: { color: "#9ED5BD" },
  companyLineRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 7 },
  companyLogo: { width: 20, height: 20, borderRadius: 5, resizeMode: "contain", backgroundColor: "rgba(255,255,255,0.15)" },
  companyLine: { color: "#CFE3D9", fontSize: 10, fontWeight: "700", textAlign: "center" },
  brandLogo: { width: 62, height: 62 },
  profileButton: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: "#DCECE4", backgroundColor: "#E5F2EB", alignItems: "center", justifyContent: "center", overflow: "visible" },
  profilePhoto: { width: 46, height: 46, borderRadius: 23 },
  profileInitial: { color: "#174D3B", fontSize: 21, fontWeight: "900" },
  menuLines: { position: "absolute", right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, backgroundColor: "#E5AC4F", borderWidth: 2, borderColor: "#174D3B", alignItems: "center", justifyContent: "center", gap: 2 },
  menuLine: { width: 8, height: 1.5, borderRadius: 1, backgroundColor: "#174D3B" },
  profileMenuBackdrop: { flex: 1, flexDirection: "row", backgroundColor: "rgba(10,28,21,.48)" },
  profileMenuDismiss: { flex: 1 },
  profileMenu: { width: "78%", maxWidth: 330, height: "100%", backgroundColor: "#F7F9F5", paddingTop: 64, paddingHorizontal: 22, shadowColor: "#000", shadowOffset: { width: 8, height: 0 }, shadowOpacity: 0.2, shadowRadius: 18, elevation: 12 },
  profileMenuHeader: { alignItems: "center", paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: "#DDE5DF" },
  profileMenuPhoto: { width: 82, height: 82, borderRadius: 41, borderWidth: 3, borderColor: "#2A9167" },
  profileMenuFallback: { width: 82, height: 82, borderRadius: 41, backgroundColor: "#DDEEE5", borderWidth: 3, borderColor: "#2A9167", alignItems: "center", justifyContent: "center" },
  profileMenuInitial: { color: "#174D3B", fontSize: 34, fontWeight: "900" },
  profileMenuName: { color: "#18392E", fontSize: 20, fontWeight: "800", marginTop: 13, textAlign: "center" },
  profileMenuEmail: { color: "#74817A", fontSize: 12, marginTop: 4, textAlign: "center" },
  profileMenuHeaderHint: { color: "#2A9167", fontSize: 9, fontWeight: "800", marginTop: 7 },
  profileMenuCompany: { backgroundColor: "#E8F2EC", borderRadius: 16, padding: 16, marginTop: 22 },
  profileCompanyLogo: { width: 52, height: 52, borderRadius: 12, resizeMode: "contain", backgroundColor: "#FFF", borderWidth: 1, borderColor: "#D8E4DC", marginTop: 8 },
  profileMenuPersonal: { backgroundColor: "#E8F2EC", borderRadius: 16, padding: 16, marginTop: 22 },
  profileMenuLabel: { color: "#6C7C73", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  profileMenuCompanyName: { color: "#174D3B", fontSize: 17, fontWeight: "800", marginTop: 7 },
  profileMenuCode: { color: "#567066", fontSize: 12, marginTop: 5 },
  profileMenuManage: { marginTop: 12, minHeight: 52, borderRadius: 14, backgroundColor: "#E5AC4F", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  profileMenuManageText: { color: "#173D31", fontSize: 14, fontWeight: "900" },
  profileMenuManageArrow: { color: "#173D31", fontSize: 25, fontWeight: "700" },
  profileMenuCreate: { backgroundColor: "#1E7A55" },
  profileMenuCreateText: { color: "#FFFFFF" },
  profileMenuJoin: { marginTop: 10, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: "#B8CDC2", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  profileMenuJoinText: { flex: 1, color: "#173D31", fontSize: 13, fontWeight: "900" },
  profileMenuOptions: { marginTop: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#DDE5DF" },
  profileMenuOption: { minHeight: 48, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E5EBE7" },
  profileMenuOptionLast: { borderBottomWidth: 0 },
  profileMenuOptionIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: "#E4F1E9", alignItems: "center", justifyContent: "center", marginRight: 11 },
  profileMenuOptionIconText: { color: "#1E7A55", fontSize: 12, fontWeight: "900" },
  profileMenuOptionText: { flex: 1, color: "#29483D", fontSize: 13, fontWeight: "700" },
  profileMenuOptionArrow: { color: "#8CA097", fontSize: 22, fontWeight: "600" },
  profileMenuExit: { marginTop: "auto", marginBottom: 34, minHeight: 50, borderRadius: 15, backgroundColor: "#F4E4E1", alignItems: "center", justifyContent: "center" },
  profileMenuExitText: { color: "#A13A2F", fontSize: 14, fontWeight: "800" },
  menuScreenBackdrop: { flex: 1, backgroundColor: "rgba(10,28,21,.52)", justifyContent: "flex-end" },
  menuScreenDismiss: { flex: 1 },
  menuScreenSheet: { maxHeight: "88%", minHeight: "55%", backgroundColor: "#F7F9F5", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, shadowColor: "#102C22", shadowOffset: { width: 0, height: -7 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 14 },
  menuScreenHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#C8D1CC", alignSelf: "center", marginBottom: 14 },
  menuScreenHeader: { paddingHorizontal: 22, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E0E7E2" },
  menuScreenEyebrow: { color: "#2A9167", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  menuScreenTitle: { color: "#18392E", fontSize: 24, fontWeight: "900", marginTop: 2 },
  menuScreenClose: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#E6EDE8", alignItems: "center", justifyContent: "center" },
  menuScreenCloseText: { color: "#476057", fontSize: 26, lineHeight: 29 },
  menuScreenScroll: { flexGrow: 0 },
  menuScreenContent: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 32 },
  menuScreenDescription: { color: "#66776F", fontSize: 13, lineHeight: 19, marginBottom: 15 },
  profileEditorPhotoWrap: { alignItems: "center", marginBottom: 12 },
  profileEditorPhoto: { width: 86, height: 86, borderRadius: 43, borderWidth: 3, borderColor: "#2A9167" },
  profileEditorFallback: { width: 86, height: 86, borderRadius: 43, backgroundColor: "#DDEEE5", borderWidth: 3, borderColor: "#2A9167", alignItems: "center", justifyContent: "center" },
  profileEditorInitial: { color: "#174D3B", fontSize: 35, fontWeight: "900" },
  profileEditorCameraBadge: { position: "absolute", right: -4, bottom: -2, width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: "#F7F9F5", backgroundColor: "#1E7A55", alignItems: "center", justifyContent: "center" },
  profileEditorCameraText: { color: "#FFF", fontSize: 20, lineHeight: 21, fontWeight: "700" },
  profileEditorName: { color: "#18392E", fontSize: 18, fontWeight: "900", marginTop: 10, textAlign: "center" },
  menuFieldLabel: { color: "#52645C", fontSize: 11, fontWeight: "800", marginTop: 10, marginBottom: 6 },
  menuFieldInput: { height: 50, borderWidth: 1, borderColor: "#D2DDD6", borderRadius: 13, backgroundColor: "#FFF", color: "#203E34", paddingHorizontal: 14, fontSize: 14 },
  profileEmailCard: { backgroundColor: "#E8F2EC", borderRadius: 13, padding: 14, marginTop: 15 },
  profileEmailLabel: { color: "#718078", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  profileEmailValue: { color: "#29483D", fontSize: 13, fontWeight: "700", marginTop: 5 },
  menuPrimaryButton: { minHeight: 52, borderRadius: 14, backgroundColor: "#1E7A55", alignItems: "center", justifyContent: "center", marginTop: 20, paddingHorizontal: 15 },
  menuPrimaryButtonText: { color: "#FFF", fontSize: 14, fontWeight: "900", textAlign: "center" },
  settingCard: { minHeight: 72, borderRadius: 15, borderWidth: 1, borderColor: "#DFE7E1", backgroundColor: "#FFF", paddingHorizontal: 15, paddingVertical: 12, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  settingTextWrap: { flex: 1 },
  settingTitle: { color: "#25473B", fontSize: 14, fontWeight: "800" },
  settingDescription: { color: "#78857E", fontSize: 10, lineHeight: 15, marginTop: 3 },
  reportHero: { borderRadius: 18, backgroundColor: "#174D3B", alignItems: "center", paddingVertical: 21, marginBottom: 12 },
  reportHeroNumber: { color: "#FFF", fontSize: 38, fontWeight: "900" },
  reportHeroLabel: { color: "#D8EBE1", fontSize: 13, fontWeight: "700" },
  reportHeroUnits: { color: "#9ED5BD", fontSize: 11, marginTop: 5 },
  reportGrid: { flexDirection: "row", gap: 8 },
  reportCard: { flex: 1, minHeight: 86, borderRadius: 15, padding: 12, justifyContent: "center" },
  reportCardExpired: { backgroundColor: "#F7E5E2" },
  reportCardExpiring: { backgroundColor: "#F8ECD9" },
  reportCardOk: { backgroundColor: "#E1F0E8" },
  reportCardNumber: { color: "#203E34", fontSize: 24, fontWeight: "900" },
  reportCardLabel: { color: "#65736C", fontSize: 10, fontWeight: "800", marginTop: 3 },
  reportInsight: { borderRadius: 15, borderWidth: 1, borderColor: "#E0E7E2", backgroundColor: "#FFF", padding: 15, marginTop: 12 },
  reportInsightTitle: { color: "#1E7A55", fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7 },
  reportInsightText: { color: "#53675E", fontSize: 12, lineHeight: 18, marginTop: 6 },
  helpCard: { borderRadius: 15, borderWidth: 1, borderColor: "#DFE7E1", backgroundColor: "#FFF", padding: 15, marginBottom: 10 },
  helpQuestion: { color: "#23463A", fontSize: 14, fontWeight: "800" },
  helpAnswer: { color: "#6B7972", fontSize: 12, lineHeight: 18, marginTop: 6 },
  helpTip: { borderRadius: 15, backgroundColor: "#FFF2D9", padding: 15, marginTop: 3 },
  helpTipTitle: { color: "#986313", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  helpTipText: { color: "#745A31", fontSize: 12, lineHeight: 18, marginTop: 5 },
  actions: { flexDirection: "row", gap: 10, paddingHorizontal: 22 },
  scanButton: { flex: 1, minHeight: 66, borderRadius: 18, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 11 },
  scanIconWrap: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#E4F2EB", alignItems: "center", justifyContent: "center" },
  scanText: { color: "#18392E", fontSize: 15, fontWeight: "800" },
  scanSubtext: { color: "#7B8882", fontSize: 11, marginTop: 2 },
  actionArrow: { color: "#86A096", fontSize: 28, marginBottom: 3 },
  addButton: { width: 66, height: 66, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#E5AC4F" },
  addText: { color: "#173D31", fontSize: 29, fontWeight: "600" },
  dashboard: { marginHorizontal: 22, marginTop: -20, minHeight: 88, borderRadius: 20, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 8, shadowColor: "#173D31", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 5 },
  stat: { flex: 1, alignItems: "center", position: "relative" },
  statDot: { width: 7, height: 7, borderRadius: 4, position: "absolute", top: 4, right: 17 },
  statNumber: { color: "#1D3C31", fontSize: 23, fontWeight: "900" },
  statLabel: { color: "#76827C", fontSize: 11, marginTop: 3, fontWeight: "600" },
  statDivider: { width: 1, height: 38, backgroundColor: "#E8ECE8" },
  listHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 22, paddingTop: 24, paddingBottom: 11 },
  listTitle: { color: "#203D33", fontSize: 19, fontWeight: "800" },
  summaryText: { color: "#7B8781", fontSize: 12 },
  headingActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  selectButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#DDEEE5" },
  selectButtonActive: { backgroundColor: "#F5E9E6" },
  selectButtonText: { color: "#176844", fontSize: 11, fontWeight: "800" },
  selectButtonTextActive: { color: "#A13A2F" },

  bulkDeleteButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: "#F8E5E2" },
  bulkDeleteButtonText: { color: "#AC3B31", fontSize: 11, fontWeight: "800" },
  categorySelectorWrap: { paddingBottom: 10 },
  categorySelectorTitle: { color: "#66756E", fontSize: 11, fontWeight: "700", paddingHorizontal: 22, marginBottom: 8 },
  categorySelector: { paddingHorizontal: 22, gap: 7 },
  categorySelectorChip: { height: 39, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: "#C8D7CF", backgroundColor: "#FFF", alignItems: "center", justifyContent: "center" },
  categorySelectorChipActive: { backgroundColor: "#1E7A55", borderColor: "#1E7A55" },
  categorySelectorChipDisabled: { opacity: 0.35 },
  categorySelectorChipText: { color: "#52645B", fontSize: 11, fontWeight: "800" },
  categorySelectorChipTextActive: { color: "#FFF" },
  expiringSelectorChip: { height: 39, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: "#D69A3A", backgroundColor: "#FFF6E8", alignItems: "center", justifyContent: "center" },
  expiringSelectorChipActive: { backgroundColor: "#B87616", borderColor: "#B87616" },
  expiringSelectorText: { color: "#945D0B", fontSize: 11, fontWeight: "800" },
  list: { paddingHorizontal: 22, paddingBottom: 30, gap: 12 },
  emptyWrap: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 44, paddingBottom: 100 },
  empty: { alignItems: "center" },
  emptyIcon: { fontSize: 52, color: "#A9B8AE", marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#2F493F", textAlign: "center" },
  emptyText: { fontSize: 14, lineHeight: 21, color: "#7A847E", textAlign: "center", marginTop: 7 },
  card: { backgroundColor: "#FFF", borderRadius: 19, flexDirection: "row", overflow: "hidden", borderWidth: 1, borderColor: "#E6EBE7", shadowColor: "#244A3D", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardSelected: { borderColor: "#2A9167", borderWidth: 2, backgroundColor: "#F7FCF9" },
  selectionCircle: { position: "absolute", zIndex: 3, top: 9, left: 12, width: 25, height: 25, borderRadius: 13, borderWidth: 2, borderColor: "#AAB8B0", backgroundColor: "#FFF", alignItems: "center", justifyContent: "center" },
  selectionCircleActive: { borderColor: "#2A9167", backgroundColor: "#2A9167" },
  selectionCheck: { color: "#FFF", fontWeight: "900", fontSize: 15 },
  statusBar: { width: 5 },
  productImage: { width: 78, height: 92, resizeMode: "contain", alignSelf: "center", marginLeft: 10, backgroundColor: "#F8F8F5", borderRadius: 12 },
  imagePlaceholder: { width: 62, height: 72, borderRadius: 12, marginLeft: 10, alignSelf: "center", alignItems: "center", justifyContent: "center", backgroundColor: "#F1F3EF" },
  imagePlaceholderText: { color: "#A2ACA5", fontSize: 24 },
  cardBody: { flex: 1, padding: 16 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  productName: { flex: 1, fontSize: 17, fontWeight: "700", color: "#243D34" },
  badge: { fontSize: 11, fontWeight: "800", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  expiry: { color: "#59665F", fontSize: 13, marginTop: 8 },
  expiredRemovalNotice: { color: "#B42318", fontSize: 11, fontWeight: "800", marginTop: 5 },
  markdownNotice: { color: "#A15C08", fontSize: 11, fontWeight: "800", marginTop: 5 },
  cardMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7, marginTop: 7 },
  categoryBadge: { color: "#1E7A55", backgroundColor: "#E5F2EB", fontSize: 10, fontWeight: "800", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  details: { color: "#8A938D", fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(12,30,23,.48)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#F8FAF7", borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 28 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#CCD1CC", alignSelf: "center", marginBottom: 18 },
  sheetTitle: { fontSize: 25, fontWeight: "800", color: "#18392E", marginBottom: 18 },
  previewWrap: { flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: "#EDF6F0", borderRadius: 15, padding: 10, marginBottom: 7 },
  previewImage: { width: 58, height: 58, resizeMode: "contain", backgroundColor: "#FFF", borderRadius: 10 },
  previewImagePlaceholder: { width: 58, height: 58, borderRadius: 10, backgroundColor: "#DDEEE5", alignItems: "center", justifyContent: "center" },
  previewImagePlaceholderText: { color: "#1E7A55", fontSize: 26, fontWeight: "700" },
  previewTitle: { fontSize: 14, fontWeight: "800", color: "#24513F" },
  previewText: { fontSize: 12, color: "#64776D", marginTop: 3 },
  productPhotoButton: { minHeight: 32, borderRadius: 9, backgroundColor: "#1E7A55", paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  productPhotoButtonText: { color: "#FFF", fontSize: 10, fontWeight: "900" },
  label: { fontSize: 12, color: "#58665E", fontWeight: "700", marginBottom: 6, marginTop: 10 },
  inputWrap: { height: 50, borderRadius: 13, borderWidth: 1, borderColor: "#D5DAD5", backgroundColor: "#FFF", flexDirection: "row", alignItems: "center", paddingRight: 12 },
  input: { flex: 1, height: 50, paddingHorizontal: 14, fontSize: 16, color: "#243D34" },
  inputSolo: { height: 50, borderRadius: 13, borderWidth: 1, borderColor: "#D5DAD5", backgroundColor: "#FFF", paddingHorizontal: 14, fontSize: 16, color: "#243D34" },
  barcodeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barcodeInput: { flex: 1 },
  barcodeCameraButton: { width: 50, height: 50, borderRadius: 13, backgroundColor: "#1E7A55", alignItems: "center", justifyContent: "center" },
  barcodeCameraText: { fontSize: 20 },
  categoryOptions: { gap: 7, paddingRight: 10, paddingVertical: 2 },
  categoryOption: { paddingHorizontal: 13, height: 38, borderRadius: 12, borderWidth: 1, borderColor: "#D5DDD7", backgroundColor: "#FFF", alignItems: "center", justifyContent: "center" },
  categoryOptionActive: { backgroundColor: "#1E7A55", borderColor: "#1E7A55" },
  categoryOptionText: { color: "#5E6C65", fontSize: 12, fontWeight: "700" },
  categoryOptionTextActive: { color: "#FFF" },
  row: { flexDirection: "row", gap: 10 },
  hint: { color: "#768078", fontSize: 12, lineHeight: 18, marginTop: 15 },
  saveButton: { height: 53, backgroundColor: "#1E7A55", borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 20 },
  saveText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  cancelButton: { height: 43, alignItems: "center", justifyContent: "center", marginTop: 4 },
  cancelText: { color: "#65736B", fontWeight: "600" },
  cameraScreen: { flex: 1, backgroundColor: "#000" },
  cameraOverlay: { flex: 1, alignItems: "center", justifyContent: "space-between", paddingVertical: 70, backgroundColor: "rgba(0,0,0,.22)" },
  cameraTitle: { color: "#FFF", fontWeight: "800", fontSize: 18, backgroundColor: "rgba(0,0,0,.5)", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  scanFrame: { width: "82%", height: 190, borderWidth: 3, borderColor: "#E8FFF2", borderRadius: 24 },
  closeCamera: { backgroundColor: "#FFF", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  closeCameraText: { color: "#243D34", fontWeight: "800" },
  pdfBar: { position: "absolute", left: 16, right: 16, bottom: 14, minHeight: 76, borderRadius: 20, backgroundColor: "#173F32", paddingHorizontal: 17, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#0D2D23", shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.24, shadowRadius: 14, elevation: 9 },
  deleteBar: { backgroundColor: "#4B2421" },
  pdfCount: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  pdfHint: { color: "#AFCFC2", fontSize: 10, marginTop: 3 },
  pdfButton: { minWidth: 104, height: 46, borderRadius: 13, backgroundColor: "#2A9167", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  deleteSelectedButton: { backgroundColor: "#B54136" },
  pdfButtonDisabled: { opacity: 0.45 },
  pdfButtonText: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  actionBackdrop: { flex: 1, backgroundColor: "rgba(9,28,21,.56)", justifyContent: "flex-end" },
  actionSheet: { backgroundColor: "#F8FAF7", borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 25 },
  actionHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#CCD4CF", alignSelf: "center", marginBottom: 20 },
  actionProductHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 21 },
  actionProductImage: { width: 72, height: 72, borderRadius: 16, resizeMode: "contain", backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E2E9E4" },
  actionProductPlaceholder: { width: 72, height: 72, borderRadius: 16, backgroundColor: "#EAF1ED", alignItems: "center", justifyContent: "center" },
  actionEyebrow: { color: "#789087", fontSize: 9, fontWeight: "800", letterSpacing: 1.3, marginBottom: 4 },
  actionProductName: { color: "#193D31", fontSize: 20, lineHeight: 24, fontWeight: "800" },
  actionMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 7 },
  actionCategory: { color: "#1E7A55", backgroundColor: "#E2F0E8", fontSize: 10, fontWeight: "800", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  actionExpiry: { color: "#707E77", fontSize: 11, fontWeight: "600" },
  selectActionButton: { minHeight: 76, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DFE7E1", borderRadius: 17, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  editActionButton: { minHeight: 76, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DFE7E1", borderRadius: 17, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  actionButtonIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#E3F1E9", alignItems: "center", justifyContent: "center" },
  editActionIcon: { color: "#1E7A55", fontSize: 23, fontWeight: "800" },
  editActionTitle: { color: "#203E34", fontSize: 15, fontWeight: "800" },
  editActionDescription: { color: "#7C8982", fontSize: 10, marginTop: 3 },
  editActionArrow: { color: "#91A29A", fontSize: 28 },
  removeActionButton: { height: 51, borderRadius: 14, backgroundColor: "#FCECE9", alignItems: "center", justifyContent: "center", marginTop: 11 },
  removeActionText: { color: "#B13B30", fontSize: 14, fontWeight: "800" },
  cancelActionButton: { height: 45, alignItems: "center", justifyContent: "center", marginTop: 3 },
  cancelActionText: { color: "#68766F", fontSize: 13, fontWeight: "700" },
  aiButton: { height: 47, borderRadius: 13, backgroundColor: "#1E7A55", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  aiButtonText: { color: "#FFF", fontSize: 13, fontWeight: "800" },

  aiActionButton: { minHeight: 52, borderRadius: 14, backgroundColor: "#E3F1E9", alignItems: "center", justifyContent: "center", marginBottom: 11 },
  aiActionText: { color: "#1E7A55", fontSize: 13, fontWeight: "800" },
});
