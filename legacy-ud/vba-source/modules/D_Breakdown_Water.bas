Attribute VB_Name = "D_Breakdown_Water"

   Sub GenerateWaterBreakDown()
   
'   Debug.Print "GenerateWaterBreakDown WWW-------" & Timer - StartTime
 
       Sheets("WaterBreakdown").Activate
        With Sheets("WaterBreakdown")
        '  Clears Water Breakdown Screen ----------------------
        .Range("A3:AZ200").ClearContents
        .Range("A3:AZ200").Interior.Pattern = xlSolid
        
        CalcTotalforActualUnitWaterIncome ' Does what it says
    
    'James   CalcSharedAmounts
      CalcSharedAmounts
    
    '#1-3 -------------------------------------------------------------------------
           
            .Cells(1, 5) = BuildingName
            .Cells(1, 22) = SelDate
            .Cells(3, 5) = "TIERED TARIFFS"
          
    '#4-------------------------------------------------------------------------
    
            .Cells(4, 2) = "Previous Reading " & PrevDate
            .Cells(4, 3) = "Selected Date " & SelDate
            .Cells(4, 4) = "Kw Used"
    
            ' Show Selected Tiered Tariff Table *********************
             WRange1 = "0 < " & WQ1
            WRange2 = WQ1 & " < " & WQ2
            WRange3 = WQ2 & " < " & WQ3
            WRange4 = WQ3 & " < " & WQ4
            
            WRange5 = WQ4 & " < " & WQ5
            WRange6 = WQ5 & " < " & WQ6
            WRange7 = WQ6 & " < " & WQ7
            WRange8 = WQ7 & " < " & WQ8
              
          
        ' Show Selected Tiered Tariff Table *********************
            .Cells(4, 5) = WRange1 & " kL"
            .Cells(4, 6) = WT1
            .Cells(4, 7) = WRange2 & " kL"
            .Cells(4, 8) = WT2
            .Cells(4, 9) = WRange3 & " kL"
            .Cells(4, 10) = WT3
            .Cells(4, 11) = WRange4 & " kL"
            .Cells(4, 12) = WT4
            .Cells(4, 13) = WRange5 & " kL"
            .Cells(4, 14) = WT5
            
            .Cells(4, 15) = WRange6 & " kL"
            .Cells(4, 16) = WT6
            .Cells(4, 17) = WRange7 & " kL"
            .Cells(4, 18) = WT7
            .Cells(4, 19) = WRange8 & " kL"
            .Cells(4, 20) = WT8
          
       
            
            .Cells(4, 21) = "Totals"
       
            .Cells(4, 22) = "Difference between BULK and UNIT totals"
         
            .Cells(4, 23) = OptionText4 & ": (" & OptionChoice4 & ")"
            .Cells(4, 24) = OptionText5 & ": (" & OptionChoice5 & ")"
            .Cells(4, 25) = OptionText6 & ": (" & OptionChoice6 & ")"
            
            .Cells(4, 26) = "GRAND TOTAL"
      '#5------------------------------------------------------------------------
      
            .Cells(5, 3) = "Bulk Total"
            .Cells(5, 4) = WaterBulkTotCon
            
            .Cells(5, 21) = WaterBulkTotCharge ' Water Charge * MUST GO FIRST
            
            .Cells(5, 5) = WaterBulkTariffU1
            .Cells(5, 6) = WaterBulkTariffC1
            .Cells(5, 7) = WaterBulkTariffU2
            .Cells(5, 8) = WaterBulkTariffC2
            .Cells(5, 9) = WaterBulkTariffU3
            .Cells(5, 10) = WaterBulkTariffC3
            .Cells(5, 11) = WaterBulkTariffU4
            .Cells(5, 12) = WaterBulkTariffC4
            .Cells(5, 13) = WaterBulkTariffU5
            .Cells(5, 14) = WaterBulkTariffC5
            .Cells(5, 15) = WaterBulkTariffU6
            .Cells(5, 16) = WaterBulkTariffC6
            .Cells(5, 17) = WaterBulkTariffU7
            .Cells(5, 18) = WaterBulkTariffC7
            .Cells(5, 19) = WaterBulkTariffU8
            .Cells(5, 20) = WaterBulkTariffC8
            
            .Cells(5, 23) = OptionAmount4
           
    '#6------------------------------------------------------------------------
       
         '   .Cells(6, 3) = "Units Total"
            .Cells(6, 3) = "Estimate Muni. Charge"
            .Cells(6, 4) = WaterUnitTotCon
            .Cells(6, 21) = WaterUnitTotCharge ' Watert Charge * MUST GO FIRST
            
            .Cells(6, 5) = WaterUnitTariffU1
            .Cells(6, 6) = WaterUnitTariffC1
            .Cells(6, 7) = WaterUnitTariffU2
            .Cells(6, 8) = WaterUnitTariffC2
            .Cells(6, 9) = WaterUnitTariffU3
            .Cells(6, 10) = WaterUnitTariffC3
            .Cells(6, 11) = WaterUnitTariffU4
            .Cells(6, 12) = WaterUnitTariffC4
            .Cells(6, 13) = WaterUnitTariffU5
            .Cells(6, 14) = WaterUnitTariffC5
            .Cells(6, 15) = WaterUnitTariffU6
            .Cells(6, 16) = WaterUnitTariffC6
            .Cells(6, 17) = WaterUnitTariffU7
            .Cells(6, 18) = WaterUnitTariffC7
            .Cells(6, 19) = WaterUnitTariffU8
            .Cells(6, 20) = WaterUnitTariffC8
              
    ' ------------------------------------------------------------------------
            If IgnoreNegComP = True And WaterDifference <= 0 Then
                .Cells(5, 22) = "(" & RemWaterDiff & ")" & " Ignored"
            Else
                 .Cells(5, 22) = WaterDifference
            End If
            
            .Cells(6, 23) = WaterDifference
            .Cells(6, 26) = "Excl VAT"
            .Cells(6, 27) = "Incl VAT"
    
    '#7------------------------------------------------------------------------
     
            .Cells(7, 4) = "Actual Income from Unit Charges >"
         
            .Cells(7, 5) = WaterActualTariffU1
            .Cells(7, 6) = WaterActualTariffC1
            .Cells(7, 7) = WaterActualTariffU2
            .Cells(7, 8) = WaterActualTariffC2
            .Cells(7, 9) = WaterActualTariffU3
            .Cells(7, 10) = WaterActualTariffC3
            .Cells(7, 11) = WaterActualTariffU4
            .Cells(7, 12) = WaterActualTariffC4
            .Cells(7, 13) = WaterActualTariffU5
            .Cells(7, 14) = WaterActualTariffC5
            .Cells(7, 15) = WaterActualTariffU6
            .Cells(7, 16) = WaterActualTariffC6
            .Cells(7, 17) = WaterActualTariffU7
            .Cells(7, 18) = WaterActualTariffC7
            .Cells(7, 19) = WaterActualTariffU8
            .Cells(7, 20) = WaterActualTariffC8
            
            .Cells(7, 21) = WaterActualTotCharge
            
            .Cells(7, 22) = "PQ Values"
            .Cells(7, 23) = WaterDifference + OptionAmount4
           
            .Cells(7, 24) = OptionAmount5
            .Cells(7, 25) = OptionAmount6
            
           '# PREPAID ------------------------------------------------------------------------
            .Cells(6, 30) = "Excl Vat"
            .Cells(7, 30) = "Incl Vat"
                   
    '#8 onward ------------------------------------------------------------------------
       
        Dim TotalWaterCost As Double
        Dim TotalWaterCostInclVat As Double
        Dim ThisWaterUnit As Double
      
        StartOffset = 8
        For i = 1 To TotalUnitCount
             
            If PrepaidWaterInstalled(i) > 0 Then .Range(Cells(i + StartOffset, 1), Cells(i + StartOffset, 1)).Interior.Pattern = xlGray50
        
            .Cells(i + StartOffset, 1) = UnitNames(i) ' Unit name
            .Cells(i + StartOffset, 2) = WaterPrevReadings(i) ' Prev Reading
            .Cells(i + StartOffset, 3) = WaterThisReadings(i) ' Selected Reading
            .Cells(i + StartOffset, 4) = WaterUnitCons(i) ' Con-sumption
                    
            ' Break down of tiered Water charges PER UNIT ------------------------------------
            If NewCalc = True Then  ' ##########################
                ThisUnitsWater = GetWaterCostsNew(WaterUnitCons(i), 1)
            Else
                ThisUnitsWater = GetWaterCosts(WaterUnitCons(i), 1)
            End If
        
        '   ThisUnitsWater = GetWaterCostsNew(WaterUnitCons(i), 1) ' PERFORMS THE CALCULATION SPLIT - MUST GO FIRST
                        
            .Cells(i + StartOffset, 5) = WaterTariffUnits1
            .Cells(i + StartOffset, 6) = WaterTariffCost1
            .Cells(i + StartOffset, 7) = WaterTariffUnits2
            .Cells(i + StartOffset, 8) = WaterTariffCost2
            .Cells(i + StartOffset, 9) = WaterTariffUnits3
            .Cells(i + StartOffset, 10) = WaterTariffCost3
            .Cells(i + StartOffset, 11) = WaterTariffUnits4
            .Cells(i + StartOffset, 12) = WaterTariffCost4  ' <<<<<<<<<<<<<<<<<<<<<<<<<<<<<
            .Cells(i + StartOffset, 13) = WaterTariffUnits5
            .Cells(i + StartOffset, 14) = WaterTariffCost5
            .Cells(i + StartOffset, 15) = WaterTariffUnits6
            .Cells(i + StartOffset, 16) = WaterTariffCost6
            .Cells(i + StartOffset, 17) = WaterTariffUnits7
            .Cells(i + StartOffset, 18) = WaterTariffCost7
            .Cells(i + StartOffset, 19) = WaterTariffUnits8
            .Cells(i + StartOffset, 20) = WaterTariffCost8
            
            .Cells(i + StartOffset, 21) = ThisUnitsWater  ' This Unit's Total Water Cost
          
            '-------------------------------------------------------------------------------
      
            PQ = PercentageQuotes(i):
            .Cells(i + StartOffset, 22) = Format(PQ, "0.00") & "%"
     
            .Cells(i + StartOffset, 23) = WaterBulkDiff(i)  ' <<<<  Problem A
            .Cells(i + StartOffset, 24) = OptionCharge5(i)
            .Cells(i + StartOffset, 25) = OptionCharge6(i)
            
            
            ' *********************************************************************************************
            
            TotalWaterCost = ThisUnitsWater + WaterBulkDiff(i) + OptionCharge5(i) + OptionCharge6(i)
            .Cells(i + StartOffset, 26) = TotalWaterCost
            TotalWaterCostInclVat = TotalWaterCost * (1 + VatPercent)
            .Cells(i + StartOffset, 27) = TotalWaterCostInclVat
            
            
                         
                ' PREPAID
            If PrepaidWaterInstalled(i) > 0 Then
                PPNoOfWaterInstalled = PPNoOfWaterInstalled + 1
                .Cells(i + StartOffset, 29) = WaterUnitCons(i)
                PPWaterConvMeterTotal = PPWaterConvMeterTotal + WaterUnitCons(i)
                 
            End If
                 
        Next
        
       
   
   '''''''''''''''''''
        .Cells(4, 29) = PPNoOfWaterInstalled & "/" & TotalUnitCount & " Units" & vbLf _
                        & "have Prepaid Meters" & vbLf _
                        & "which used " & vbLf & PPWaterConvMeterTotal & "Kw"
        
        If NewCalc = True Then  ' ##########################
             PPTotalWaterCost = GetWaterCostsNew(PPWaterConvMeterTotal, PPNoOfWaterInstalled)
        Else
            PPTotalWaterCost = GetWaterCosts(PPWaterConvMeterTotal, PPNoOfWaterInstalled)
        End If
        
    '    PPTotalWaterCost = GetWaterCostsNew(PPWaterConvMeterTotal, PPNoOfWaterInstalled)
        
        .Cells(6, 29) = PPTotalWaterCost
        PPTotalWaterCostInclVat = PPTotalWaterCost * (1 + VatPercent)
        .Cells(7, 29) = PPTotalWaterCostInclVat
        
   
    End With
    
    ActiveWindow.ScrollRow = 1
    
End Sub

Sub CalcTotalforActualUnitWaterIncome()
   ' Output Units
    
        WaterActualTariffU1 = 0
        WaterActualTariffC1 = 0
        WaterActualTariffU2 = 0
        WaterActualTariffC2 = 0
        WaterActualTariffU3 = 0
        WaterActualTariffC3 = 0
        WaterActualTariffU4 = 0
        WaterActualTariffC4 = 0
        WaterActualTariffC5 = 0
        WaterActualTariffC5 = 0
        WaterActualTariffU6 = 0
        WaterActualTariffC6 = 0
        WaterActualTariffU7 = 0
        WaterActualTariffC7 = 0
        WaterActualTariffU8 = 0
        WaterActualTariffC8 = 0
    
    Dim ThisWaterUnit As Double
    
    For UnitNo = 1 To TotalUnitCount
    
        If NewCalc = True Then  ' ##########################
            ThisWaterUnit = GetWaterCostsNew(WaterUnitCons(UnitNo), 1)
        Else
            ThisWaterUnit = GetWaterCosts(WaterUnitCons(UnitNo), 1)
        End If
                
       ' ThisWaterUnit = GetWaterCostsNew(WaterUnitCons(UnitNo), 1) ' PERFORMS THE CALCULATION SPLIT - MUST GO FIRST
        
       ' XX = GetWaterCostsX(WaterUnitCons(UnitNo))
        
        
        
          UnitWaterCost(UnitNo) = ThisWaterUnit
     
        WaterActualTariffU1 = WaterActualTariffU1 + WaterTariffUnits1
        WaterActualTariffC1 = WaterActualTariffC1 + WaterTariffCost1
        WaterActualTariffU2 = WaterActualTariffU2 + WaterTariffUnits2
        WaterActualTariffC2 = WaterActualTariffC2 + WaterTariffCost2
        WaterActualTariffU3 = WaterActualTariffU3 + WaterTariffUnits3
        WaterActualTariffC3 = WaterActualTariffC3 + WaterTariffCost3
        WaterActualTariffU4 = WaterActualTariffU4 + WaterTariffUnits4
        WaterActualTariffC4 = WaterActualTariffC4 + WaterTariffCost4
                
       ' WaterActualTariffC5 = WaterActualTariffC5 + WaterTariffUnits5 <<<<<ERROR!!!!!
         WaterActualTariffU5 = WaterActualTariffU5 + WaterTariffUnits5 ' Corrected - Replaced "C" with "U"
                
        WaterActualTariffC5 = WaterActualTariffC5 + WaterTariffCost5
        WaterActualTariffU6 = WaterActualTariffU6 + WaterTariffUnits6
        WaterActualTariffC6 = WaterActualTariffC6 + WaterTariffCost6
        WaterActualTariffU7 = WaterActualTariffU7 + WaterTariffUnits7
        WaterActualTariffC7 = WaterActualTariffC7 + WaterTariffCost7
        WaterActualTariffU8 = WaterActualTariffU8 + WaterTariffUnits8
        WaterActualTariffC8 = WaterActualTariffC8 + WaterTariffCost8
        
        ' ***********************************
        
    Next
    
        WaterActualTotCharge = WaterActualTariffC1 + WaterActualTariffC2 + WaterActualTariffC3 + WaterActualTariffC4 + WaterActualTariffC5 + WaterActualTariffC6 + WaterActualTariffC7 + WaterActualTariffC8
        
        WaterDifference = WaterBulkTotCharge - WaterActualTotCharge '-
     
        RemWaterDiff = Format(WaterDifference, "#.00")
        If IgnoreNegComP = True Then If WaterDifference < 0 Then WaterDifference = 0
    
       
    
    
End Sub
