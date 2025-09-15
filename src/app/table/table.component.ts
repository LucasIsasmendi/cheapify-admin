import { AfterViewInit, Component, ViewChild, inject, OnDestroy } from '@angular/core';
import { MatTableModule, MatTable } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { HttpClient } from '@angular/common/http';
import { AsyncPipe, CommonModule, CurrencyPipe } from '@angular/common';
import { Observable, BehaviorSubject, of, combineLatest, Subject } from 'rxjs';
import { map, switchMap, catchError, distinctUntilChanged, debounceTime, takeUntil } from 'rxjs/operators';
import { MatTableDataSource } from '@angular/material/table';

interface ProductItem {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  price?: number;
  quantity?: number;
  unit?: string;
  pricePerUnit?: string;
  image?: string;
  netWeight?: { t: number, u: string };
  supermarket?: string;
}

@Component({
  selector: 'app-table',
  templateUrl: './table.component.html',
  styleUrl: './table.component.scss',
  standalone: true,
  imports: [
    MatTableModule, 
    MatPaginatorModule, 
    MatSortModule,
    MatChipsModule,
    MatCardModule,
    MatIconModule,
    AsyncPipe,
    CommonModule,
    CurrencyPipe
  ]
})
export class TableComponent implements AfterViewInit, OnDestroy {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatTable) table!: MatTable<ProductItem>;
  
  private http = inject(HttpClient);
  private destroy$ = new Subject<void>();

  // Filter subjects
  private selectedSupermarketSubject = new BehaviorSubject<string | null>(null);
  private selectedCategorySubject = new BehaviorSubject<string | null>('salad');

  selectedSupermarket$ = this.selectedSupermarketSubject.asObservable().pipe(
    distinctUntilChanged(),
    takeUntil(this.destroy$)
  );
  selectedCategory$ = this.selectedCategorySubject.asObservable().pipe(
    distinctUntilChanged(),
    takeUntil(this.destroy$)
  );

  dataSource = new MatTableDataSource<ProductItem>([]);

  /** Columns displayed in the table. Columns IDs can be added, removed, or reordered. */
  displayedColumns = ['image', 'name', 'subcategory', 'price', 'netWeight'];

  supermarkets = [
    {id: "as", name: "Asda"},
    {id: "al", name: "Aldi"},
    {id: "ms", name: "Morrisons"},
    {id: "oc", name: "Ocado"},
    {id: "tc", name: "Tesco"},
  ];

  categories = [
    {id: "fruit", name: "Fruit"},
    {id: "vegs", name: "Vegetables"},
    {id: "sndfm", name: "Seeds & Nuts"},
    {id: "prtn", name: "Protein"},
    {id: "salad", name: "Salad"},
  ];

  filteredData$: Observable<ProductItem[]> = combineLatest([
    this.selectedCategory$,
    this.selectedSupermarket$
  ]).pipe(
    debounceTime(100),
    distinctUntilChanged(([prevCat, prevSup], [currCat, currSup]) => 
      prevCat === currCat && prevSup === currSup
    ),
    switchMap(([selectedCategory, selectedSupermarket]) => {
      console.log('Filter changed:', { selectedCategory, selectedSupermarket });
      
      if (!selectedCategory) {
        console.log('No category selected, returning empty array');
        return of([]);
      }
      
      return this.loadFromData3Structure(selectedCategory, selectedSupermarket).pipe(
        map(items => {
          console.log('Loaded items for category:', selectedCategory, items.length);
          return items;
        }),
        catchError(error => {
          console.error('Error in filteredData$ processing:', error);
          return of([]);
        })
      );
    }),
    takeUntil(this.destroy$)
  );

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    
    // Subscribe to filtered data and update table
    this.filteredData$.subscribe(items => {
      this.dataSource.data = items;
      this.table.dataSource = this.dataSource;
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadFromData3Structure(category: string, supermarketId: string | null): Observable<ProductItem[]> {
    return this.http.get<any>(`/data-3/${category}.json`).pipe(
      map(data => this.processData3Structure(data, category, supermarketId)),
      catchError(error => {
        console.error(`Error loading data-3 structure for ${category}:`, error);
        return of([]);
      }),
      takeUntil(this.destroy$)
    );
  }

  private processData3Structure(data: any, categoryName: string, supermarketId: string | null): ProductItem[] {
    const items: ProductItem[] = [];
    
    if (!data.items) {
      return items;
    }

    // Process each subcategory and filter by supermarket if specified
    Object.keys(data.items).forEach(subcategoryKey => {
      const subcategoryData = data.items[subcategoryKey];
      
      if (typeof subcategoryData === 'object' && subcategoryData !== null) {
        this.processSubcategory(subcategoryData, subcategoryKey, categoryName, supermarketId, items);
      }
    });

    return items;
  }

  private processSubcategory(subcategoryData: any, subcategoryKey: string, categoryName: string, supermarketId: string | null, items: ProductItem[]) {
    // Check if this subcategory has supermarket-specific data
    if (supermarketId && subcategoryData[supermarketId]) {
      // Direct supermarket data under subcategory
      this.processProductsForSupermarket(subcategoryData[supermarketId], subcategoryKey, categoryName, supermarketId, items);
    } else if (!supermarketId) {
      // No supermarket filter, process all supermarkets
      Object.keys(subcategoryData).forEach(key => {
        if (this.supermarkets.some(s => s.id === key)) {
          this.processProductsForSupermarket(subcategoryData[key], subcategoryKey, categoryName, key, items);
        } else {
          // Check for nested categories
          const nestedData = subcategoryData[key];
          if (typeof nestedData === 'object' && nestedData !== null) {
            Object.keys(nestedData).forEach(supermarketKey => {
              if (this.supermarkets.some(s => s.id === supermarketKey)) {
                this.processProductsForSupermarket(nestedData[supermarketKey], `${subcategoryKey} - ${key}`, categoryName, supermarketKey, items);
              }
            });
          }
        }
      });
    } else {
      // Check for nested categories that might have supermarket data
      Object.keys(subcategoryData).forEach(nestedKey => {
        const nestedData = subcategoryData[nestedKey];
        if (typeof nestedData === 'object' && nestedData !== null) {
          if (nestedData[supermarketId]) {
            // Supermarket data found in nested category
            this.processProductsForSupermarket(nestedData[supermarketId], `${subcategoryKey} - ${nestedKey}`, categoryName, supermarketId, items);
          }
        }
      });
    }
  }

  private processProductsForSupermarket(productsData: any, subcategory: string, categoryName: string, supermarketId: string, items: ProductItem[]) {
    if (typeof productsData === 'object' && productsData !== null) {
      Object.keys(productsData).forEach(productId => {
        const product = productsData[productId];
        if (product && typeof product === 'object' && product.n) {
          items.push(this.createProductItem(product, productId, categoryName, subcategory, supermarketId));
        }
      });
    }
  }

  private createProductItem(product: any, productId: string, categoryName: string, subcategory: string, supermarketId: string): ProductItem {
    return {
      id: productId,
      name: product.n,
      category: categoryName,
      subcategory: subcategory,
      price: product.p ? Math.round(product.p * 100) : 0, // Convert to pence
      quantity: product.q,
      unit: product.u,
      pricePerUnit: product.ppuom,
      image: product.img,
      netWeight: product.nw,
      supermarket: this.getSupermarketName(supermarketId)
    };
  }

  selectSupermarket(supermarketId: string) {
    if (this.selectedSupermarketSubject.value === supermarketId) {
      this.selectedSupermarketSubject.next(null);
    } else {
      this.selectedSupermarketSubject.next(supermarketId);
    }
  }

  selectCategory(categoryId: string) {
    if (this.selectedCategorySubject.value === categoryId) {
      this.selectedCategorySubject.next(null);
    } else {
      this.selectedCategorySubject.next(categoryId);
    }
  }

  isSupermarketSelected(supermarketId: string): Observable<boolean> {
    return this.selectedSupermarket$.pipe(
      map(selected => selected === supermarketId)
    );
  }

  isCategorySelected(categoryId: string): Observable<boolean> {
    return this.selectedCategory$.pipe(
      map(selected => selected === categoryId)
    );
  }

  getSupermarketName(supermarketId: string): string {
    const supermarket = this.supermarkets.find(s => s.id === supermarketId);
    return supermarket ? supermarket.name : supermarketId;
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.style.display = 'none';
    }
  }
}