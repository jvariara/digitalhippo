import {
  AfterChangeHook,
  BeforeChangeHook,
} from "payload/dist/collections/config/types";
import { PRODUCT_CATEGORIES } from "../../config";
import { Access, CollectionConfig } from "payload/types";
import { Product, User } from "../../payload-types";
import { stripe } from "../../lib/stripe";

const addUser: BeforeChangeHook<Product> = async ({ req, data }) => {
  const user = req.user;

  return { ...data, user: user.id };
};

// connect user to product
const syncUser: AfterChangeHook<Product> = async ({ req, doc }) => {
  // get the user
  const fullUser = await req.payload.findByID({
    collection: "users",
    id: req.user.id,
  });

  // check if fullUser is an object, to confirm its an actual User object
  if (fullUser && typeof fullUser === "object") {
    const { products } = fullUser;

    const allIds = [
      ...(products?.map((product) =>
        typeof product === "object" ? product.id : product
      ) || []),
    ];

    // find one we just created
    const createdProductIDs = allIds.filter(
      (id, index) => allIds.indexOf(id) === index
    );

    const dataToUpdate = [...createdProductIDs, doc.id];

    await req.payload.update({
      collection: "users",
      id: fullUser.id,
      data: {
        products: dataToUpdate,
      },
    });
  }
};

const isAdminOrHasAccess =
  (): Access =>
  ({ req: { user: _user } }) => {
    const user = _user as User | undefined;

    if (!user) return false;
    if (user.role === "admin") return true;

    // only read your own products
    // get ids of all products you own
    const userProductIDs = (user.products || []).reduce<Array<string>>(
      (acc, product) => {
        if (!product) return acc;
        if (typeof product === "string") {
          // its just the productId
          acc.push(product);
        } else {
          // we know its the entire object
          acc.push(product.id);
        }
        return acc;
      },
      []
    );

    return {
      id: {
        in: userProductIDs,
      },
    };
  };

export const Products: CollectionConfig = {
  slug: "products",
  admin: {
    useAsTitle: "name",
  },
  access: {
    read: isAdminOrHasAccess(),
    update: isAdminOrHasAccess(),
    delete: isAdminOrHasAccess(),
  },
  hooks: {
    afterChange: [syncUser],
    beforeChange: [
      addUser,
      async (args) => {
        if (args.operation === "create") {
          // creating a new product
          const data = args.data as Product;

          // create a product in stripe
          const createdProduct = await stripe.products.create({
            name: data.name,
            default_price_data: {
              currency: "USD",
              unit_amount: Math.round(data.price * 100),
            },
          });

          const updated: Product = {
            ...data,
            stripeId: createdProduct.id,
            priceId: createdProduct.default_price as string,
          };

          return updated;
        } else if (args.operation === "update") {
          // change product in stripe
          const data = args.data as Product;

          const updatedProduct = await stripe.products.update(data.stripeId!, {
            name: data.name,
            default_price: data.priceId!,
          });

          const updated: Product = {
            ...data,
            stripeId: updatedProduct.id,
            priceId: updatedProduct.default_price as string,
          };

          return updated;
        }
      },
    ],
  },
  fields: [
    {
      name: "user", // each product has a user
      type: "relationship", // connect user table to product table
      relationTo: "users",
      required: true,
      hasMany: false, // 1 product cannot be created  by multiple ppl
      admin: {
        condition: () => false, // hide from admin dashboard
      },
    },
    {
      name: "name", // each product has a name
      label: "Name",
      type: "text",
      required: true,
    },
    {
      name: "description", // each product can have a description
      type: "textarea",
      label: "Product details",
    },
    {
      name: "price", // each product has a price
      label: "Price in USD",
      min: 0,
      max: 1000,
      type: "number",
      required: true,
    },
    {
      name: "category", // each product has a category
      label: "Category",
      type: "select",
      options: PRODUCT_CATEGORIES.map(({ label, value }) => ({ label, value })),
      required: true,
    },
    {
      name: "product_files", // what the user actually pays for
      label: "Product file(s)",
      type: "relationship",
      required: true,
      relationTo: "product_files",
      hasMany: false, // change if we want mutliple files
    },
    {
      name: "approvedForSale", // to check if the product was approved by admins
      label: "Product Status",
      type: "select",
      defaultValue: "pending",
      access: {
        create: ({ req }) => req.user.role === "admin", // only admins can create
        read: ({ req }) => req.user.role === "admin", // only admins can read
        update: ({ req }) => req.user.role === "admin", // only admins can update
      },
      options: [
        {
          label: "Pending verification",
          value: "pending",
        },
        {
          label: "Approved",
          value: "approved",
        },
        {
          label: "Denied",
          value: "denied",
        },
      ],
    },
    {
      name: "priceId", // each product has a stripe product associated with it for checkout
      access: {
        create: () => false, // nothing can change this besides us on backend through code
        read: () => false,
        update: () => false,
      },
      type: "text",
      admin: {
        hidden: true,
      },
    },
    {
      name: "stripeId", // correspond to a product inside of stripe
      access: {
        create: () => false, // nothing can change this besides us on backend through code
        read: () => false,
        update: () => false,
      },
      type: "text",
      admin: {
        hidden: true,
      },
    },
    {
      name: "images", // images for products to display
      type: "array",
      label: "Product images",
      minRows: 1,
      maxRows: 4,
      required: true,
      labels: {
        singular: "Image",
        plural: "Images",
      },
      fields: [
        {
          name: "image",
          type: "upload",
          relationTo: "media",
          required: true,
        },
      ],
    },
  ],
};
